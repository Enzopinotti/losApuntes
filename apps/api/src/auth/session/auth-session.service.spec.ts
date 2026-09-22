import {
  type AuthSessionRecord,
  type AuthSessionStore,
  type CreateAuthSessionRecord,
} from './auth-session.types';
import { AuthSessionService } from './auth-session.service';
import { hashSessionToken } from './session-token';

const SESSION_A = 'a9a77b19-44e9-47fa-af61-e706ddf63125';
const SESSION_B = 'd0446434-12eb-4c50-982b-009466aba571';

function record(overrides: Partial<AuthSessionRecord> = {}): AuthSessionRecord {
  return {
    id: SESSION_A,
    userId: 'user-1',
    tokenHash: 'a'.repeat(64),
    clientType: 'web',
    createdAt: new Date('2026-09-22T12:00:00.000Z'),
    lastSeenAt: new Date('2026-09-22T12:00:00.000Z'),
    expiresAt: new Date('2026-10-22T12:00:00.000Z'),
    ...overrides,
  };
}

function createStore() {
  const create = jest.fn<
    Promise<AuthSessionRecord>,
    [CreateAuthSessionRecord]
  >();
  const findActiveByTokenHash = jest.fn<
    Promise<AuthSessionRecord | null>,
    [string, Date]
  >();
  const listActiveForUser = jest.fn<
    Promise<AuthSessionRecord[]>,
    [string, Date]
  >();
  const touchLastSeen = jest.fn<Promise<void>, [string, Date]>();
  const revokeByTokenHash = jest.fn<Promise<void>, [string]>();
  const revokeOwnedById = jest.fn<Promise<boolean>, [string, string]>();
  const revokeAllForUser = jest.fn<Promise<void>, [string]>();

  create.mockImplementation((input) => Promise.resolve(record(input)));

  const store: AuthSessionStore = {
    create,
    findActiveByTokenHash,
    listActiveForUser,
    touchLastSeen,
    revokeByTokenHash,
    revokeOwnedById,
    revokeAllForUser,
  };

  return {
    store,
    mocks: {
      create,
      findActiveByTokenHash,
      listActiveForUser,
      touchLastSeen,
      revokeByTokenHash,
      revokeOwnedById,
      revokeAllForUser,
    },
  };
}

describe('AuthSessionService', () => {
  it('persists only the session-token hash and a storage-independent public id', async () => {
    const { store, mocks } = createStore();
    let persisted: CreateAuthSessionRecord | undefined;

    mocks.create.mockImplementation((input) => {
      persisted = input;
      return Promise.resolve(record(input));
    });

    const service = new AuthSessionService(store);
    const result = await service.issue(
      'user-1',
      'web',
      new Date('2026-09-22T12:00:00.000Z'),
    );

    expect(result.sessionToken).toHaveLength(43);
    expect(persisted?.tokenHash).toBe(hashSessionToken(result.sessionToken));
    expect(JSON.stringify(persisted)).not.toContain(result.sessionToken);
    expect(persisted?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    );
    expect(result.session.id).toBe(persisted?.id);
    expect(result.session.clientType).toBe('web');
    expect(result.session.current).toBe(true);
  });

  it('resolves only an active session for the expected transport', async () => {
    const { store, mocks } = createStore();
    const service = new AuthSessionService(store);
    const issued = await service.issue(
      'user-1',
      'web',
      new Date('2026-09-22T12:00:00.000Z'),
    );

    mocks.findActiveByTokenHash.mockResolvedValue(
      record({
        id: issued.session.id,
        tokenHash: hashSessionToken(issued.sessionToken),
      }),
    );

    await expect(
      service.resolve(
        issued.sessionToken,
        'web',
        new Date('2026-09-22T12:01:00.000Z'),
      ),
    ).resolves.toMatchObject({
      userId: 'user-1',
      session: {
        clientType: 'web',
      },
    });

    await expect(
      service.resolve(
        issued.sessionToken,
        'mobile',
        new Date('2026-09-22T12:01:00.000Z'),
      ),
    ).resolves.toBeNull();
  });

  it('rejects malformed bearer values without touching the store', async () => {
    const { store, mocks } = createStore();
    const service = new AuthSessionService(store);

    await expect(service.resolve('bad-token', 'web')).resolves.toBeNull();
    expect(mocks.findActiveByTokenHash).not.toHaveBeenCalled();
  });

  it('updates coarse last-seen time only after the touch interval', async () => {
    const { store, mocks } = createStore();
    const service = new AuthSessionService(store);
    const issued = await service.issue(
      'user-1',
      'web',
      new Date('2026-09-22T12:00:00.000Z'),
    );

    mocks.findActiveByTokenHash.mockResolvedValue(
      record({
        id: issued.session.id,
        tokenHash: hashSessionToken(issued.sessionToken),
        lastSeenAt: new Date('2026-09-22T12:00:00.000Z'),
      }),
    );

    await service.resolve(
      issued.sessionToken,
      'web',
      new Date('2026-09-22T12:04:59.000Z'),
    );
    expect(mocks.touchLastSeen).not.toHaveBeenCalled();

    await service.resolve(
      issued.sessionToken,
      'web',
      new Date('2026-09-22T12:05:00.000Z'),
    );
    expect(mocks.touchLastSeen.mock.calls).toEqual([
      [issued.session.id, new Date('2026-09-22T12:05:00.000Z')],
    ]);
  });

  it('marks only the current session in inventory', async () => {
    const { store, mocks } = createStore();
    mocks.listActiveForUser.mockResolvedValue([
      record({ id: SESSION_A }),
      record({ id: SESSION_B, clientType: 'mobile' }),
    ]);

    const service = new AuthSessionService(store);
    await expect(service.listForUser('user-1', SESSION_B)).resolves.toEqual([
      expect.objectContaining({ id: SESSION_A, current: false }),
      expect.objectContaining({
        id: SESSION_B,
        clientType: 'mobile',
        current: true,
      }),
    ]);
  });

  it('revokes only a hash derived from a valid current bearer', async () => {
    const { store, mocks } = createStore();
    const service = new AuthSessionService(store);

    await service.revokeCurrent('invalid');
    expect(mocks.revokeByTokenHash).not.toHaveBeenCalled();

    const issued = await service.issue('user-1', 'web');
    await service.revokeCurrent(issued.sessionToken);

    expect(mocks.revokeByTokenHash.mock.calls).toEqual([
      [hashSessionToken(issued.sessionToken)],
    ]);
  });

  it('rejects malformed public session ids before hitting persistence', async () => {
    const { store, mocks } = createStore();
    const service = new AuthSessionService(store);

    await expect(service.revokeOwned('user-1', 'mongo-object-id')).resolves.toBe(
      false,
    );
    expect(mocks.revokeOwnedById).not.toHaveBeenCalled();
  });

  it('delegates revoke-all to the account-scoped store operation', async () => {
    const { store, mocks } = createStore();
    const service = new AuthSessionService(store);

    await service.revokeAll('user-1');

    expect(mocks.revokeAllForUser.mock.calls).toEqual([['user-1']]);
  });
});
