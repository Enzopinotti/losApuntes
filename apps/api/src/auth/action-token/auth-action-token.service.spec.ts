import {
  type AuthActionPurpose,
  type AuthActionTokenRecord,
  type AuthActionTokenStore,
  type CreateAuthActionTokenRecord,
} from './auth-action-token.types';
import { AuthActionTokenService } from './auth-action-token.service';
import { hashActionToken } from './action-token';

const NOW = new Date('2026-09-22T15:30:00.000Z');

function record(
  overrides: Partial<AuthActionTokenRecord> = {},
): AuthActionTokenRecord {
  return {
    id: '2cf64a3e-f0a9-46b0-b9b6-4da4503757b7',
    userId: 'user-1',
    purpose: 'email_verification',
    tokenHash: 'a'.repeat(64),
    issueBucket: Math.floor(NOW.getTime() / 60_000),
    createdAt: NOW,
    expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
    consumedAt: null,
    ...overrides,
  };
}

function createStore() {
  const createIfBucketAvailable = jest.fn<
    Promise<AuthActionTokenRecord | null>,
    [CreateAuthActionTokenRecord]
  >();
  const findAvailableByTokenHash = jest.fn<
    Promise<AuthActionTokenRecord | null>,
    [string, AuthActionPurpose, Date]
  >();
  const claimAvailableByTokenHash = jest.fn<
    Promise<AuthActionTokenRecord | null>,
    [string, AuthActionPurpose, Date]
  >();
  const findLatestActiveForUserPurpose = jest.fn<
    Promise<AuthActionTokenRecord | null>,
    [string, AuthActionPurpose, Date]
  >();
  const listActiveForUserPurpose = jest.fn<
    Promise<AuthActionTokenRecord[]>,
    [string, AuthActionPurpose, Date]
  >();
  const invalidateByIds = jest.fn<
    Promise<void>,
    [string, AuthActionPurpose, string[], Date]
  >();
  const invalidateAllForUserPurpose = jest.fn<
    Promise<void>,
    [string, AuthActionPurpose, Date]
  >();

  createIfBucketAvailable.mockImplementation((input) =>
    Promise.resolve(record(input)),
  );
  findLatestActiveForUserPurpose.mockResolvedValue(null);
  listActiveForUserPurpose.mockResolvedValue([]);

  const store: AuthActionTokenStore = {
    createIfBucketAvailable,
    findAvailableByTokenHash,
    claimAvailableByTokenHash,
    findLatestActiveForUserPurpose,
    listActiveForUserPurpose,
    invalidateByIds,
    invalidateAllForUserPurpose,
  };

  return {
    store,
    mocks: {
      createIfBucketAvailable,
      findAvailableByTokenHash,
      claimAvailableByTokenHash,
      findLatestActiveForUserPurpose,
      listActiveForUserPurpose,
      invalidateByIds,
      invalidateAllForUserPurpose,
    },
  };
}

describe('AuthActionTokenService', () => {
  it('persists only the verification token hash with a 24-hour TTL', async () => {
    const { store, mocks } = createStore();
    let persisted: CreateAuthActionTokenRecord | undefined;

    mocks.createIfBucketAvailable.mockImplementation((input) => {
      persisted = input;
      return Promise.resolve(record(input));
    });

    const service = new AuthActionTokenService(store);
    const issued = await service.issueIfAllowed(
      'user-1',
      'email_verification',
      undefined,
      NOW,
    );

    expect(issued).not.toBeNull();
    if (!issued || !persisted) {
      throw new Error('Expected an issued verification token');
    }

    expect(issued.token).toHaveLength(43);
    expect(persisted.tokenHash).toBe(hashActionToken(issued.token));
    expect(JSON.stringify(persisted)).not.toContain(issued.token);
    expect(persisted.credentialVersion).toBeUndefined();
    expect(issued.expiresAt.getTime() - NOW.getTime()).toBe(
      24 * 60 * 60 * 1000,
    );
  });

  it('binds recovery to credential version with a 30-minute TTL', async () => {
    const { store } = createStore();
    const service = new AuthActionTokenService(store);

    const issued = await service.issueIfAllowed(
      'user-1',
      'password_recovery',
      3,
      NOW,
    );

    expect(issued).not.toBeNull();
    if (!issued) {
      throw new Error('Expected an issued recovery token');
    }

    expect(issued.expiresAt.getTime() - NOW.getTime()).toBe(30 * 60 * 1000);
  });

  it('enforces a one-minute issuance cooldown without rotating the active link', async () => {
    const { store, mocks } = createStore();
    mocks.findLatestActiveForUserPurpose.mockResolvedValue(
      record({
        createdAt: new Date(NOW.getTime() - 30_000),
      }),
    );

    const service = new AuthActionTokenService(store);

    await expect(
      service.issueIfAllowed(
        'user-1',
        'email_verification',
        undefined,
        NOW,
      ),
    ).resolves.toBeNull();

    expect(mocks.createIfBucketAvailable).not.toHaveBeenCalled();
  });

  it('keeps at most three active tokens per account and purpose', async () => {
    const { store, mocks } = createStore();
    const ids = ['newest', 'second', 'third', 'oldest'];

    mocks.listActiveForUserPurpose.mockResolvedValue(
      ids.map((id, index) =>
        record({
          id,
          createdAt: new Date(NOW.getTime() - index * 61_000),
        }),
      ),
    );

    const service = new AuthActionTokenService(store);

    await service.issueIfAllowed(
      'user-1',
      'email_verification',
      undefined,
      NOW,
    );

    expect(mocks.invalidateByIds.mock.calls).toEqual([
      ['user-1', 'email_verification', ['oldest'], NOW],
    ]);
  });

  it('rejects malformed inspect and claim tokens before persistence lookup', async () => {
    const { store, mocks } = createStore();
    const service = new AuthActionTokenService(store);

    await expect(
      service.inspect('not-a-token', 'password_recovery', NOW),
    ).resolves.toBeNull();
    await expect(
      service.claim('not-a-token', 'password_recovery', NOW),
    ).resolves.toBeNull();

    expect(mocks.findAvailableByTokenHash).not.toHaveBeenCalled();
    expect(mocks.claimAvailableByTokenHash).not.toHaveBeenCalled();
  });

  it('atomically claims by hash and purpose without exposing the bearer', async () => {
    const { store, mocks } = createStore();
    const service = new AuthActionTokenService(store);
    const issued = await service.issueIfAllowed(
      'user-1',
      'password_recovery',
      4,
      NOW,
    );

    expect(issued).not.toBeNull();
    if (!issued) {
      throw new Error('Expected an issued token');
    }

    const consumedAt = new Date(NOW.getTime() + 1_000);
    const claimed = record({
      purpose: 'password_recovery',
      credentialVersion: 4,
      tokenHash: hashActionToken(issued.token),
      consumedAt,
    });
    mocks.claimAvailableByTokenHash.mockResolvedValue(claimed);

    await expect(
      service.claim(issued.token, 'password_recovery', consumedAt),
    ).resolves.toEqual(claimed);

    expect(mocks.claimAvailableByTokenHash.mock.calls).toEqual([
      [hashActionToken(issued.token), 'password_recovery', consumedAt],
    ]);
  });
});
