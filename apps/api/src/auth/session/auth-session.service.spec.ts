import {
  type AuthSessionRecord,
  type AuthSessionStore,
  type CreateAuthSessionRecord,
} from './auth-session.types';
import { AuthSessionService } from './auth-session.service';
import { hashSessionToken } from './session-token';

function createStore(): jest.Mocked<AuthSessionStore> {
  return {
    create: jest.fn(),
    findActiveByTokenHash: jest.fn(),
    listActiveForUser: jest.fn(),
    touchLastSeen: jest.fn(),
    revokeByTokenHash: jest.fn(),
    revokeOwnedById: jest.fn(),
    revokeAllForUser: jest.fn(),
  };
}

function record(
  overrides: Partial<AuthSessionRecord> = {},
): AuthSessionRecord {
  return {
    id: '507f1f77bcf86cd799439011',
    userId: 'user-1',
    tokenHash: 'a'.repeat(64),
    clientType: 'web',
    createdAt: new Date('2026-09-22T12:00:00.000Z'),
    lastSeenAt: new Date('2026-09-22T12:00:00.000Z'),
    expiresAt: new Date('2026-10-22T12:00:00.000Z'),
    ...overrides,
  };
}

describe('AuthSessionService', () => {
  it('persists only the session-token hash', async () => {
    const store = createStore();
    let persisted: CreateAuthSessionRecord | undefined;

    store.create.mockImplementation((input) => {
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
    expect(persisted?.tokenHash).toBe(
      hashSessionToken(result.sessionToken),
    );
    expect(JSON.stringify(persisted)).not.toContain(result.sessionToken);
    expect(result.session.clientType).toBe('web');
    expect(result.session.current).toBe(true);
  });

  it('resolves only an active session for the expected transport', async () => {
    const store = createStore();
    const service = new AuthSessionService(store);
    const issued = await service.issue(
      'user-1',
      'web',
      new Date('2026-09-22T12:00:00.000Z'),
    );

    store.findActiveByTokenHash.mockResolvedValue(
      record({
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
    const store = createStore();
    const service = new AuthSessionService(store);

    await expect(service.resolve('bad-token', 'web')).resolves.toBeNull();
    expect(store.findActiveByTokenHash).not.toHaveBeenCalled();
  });

  it('updates coarse last-seen time only after the touch interval', async () => {
    const store = createStore();
    const service = new AuthSessionService(store);
    const issued = await service.issue(
      'user-1',
      'web',
      new Date('2026-09-22T12:00:00.000Z'),
    );

    store.findActiveByTokenHash.mockResolvedValue(
      record({
        tokenHash: hashSessionToken(issued.sessionToken),
        lastSeenAt: new Date('2026-09-22T12:00:00.000Z'),
      }),
    );

    await service.resolve(
      issued.sessionToken,
      'web',
      new Date('2026-09-22T12:04:59.000Z'),
    );
    expect(store.touchLastSeen).not.toHaveBeenCalled();

    await service.resolve(
      issued.sessionToken,
      'web',
      new Date('2026-09-22T12:05:00.000Z'),
    );
    expect(store.touchLastSeen).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      new Date('2026-09-22T12:05:00.000Z'),
    );
  });

  it('marks only the current session in inventory', async () => {
    const store = createStore();
    store.listActiveForUser.mockResolvedValue([
      record({ id: 'session-a' }),
      record({ id: 'session-b', clientType: 'mobile' }),
    ]);

    const service = new AuthSessionService(store);
    await expect(
      service.listForUser('user-1', 'session-b'),
    ).resolves.toEqual([
      expect.objectContaining({ id: 'session-a', current: false }),
      expect.objectContaining({
        id: 'session-b',
        clientType: 'mobile',
        current: true,
      }),
    ]);
  });

  it('revokes only a hash derived from a valid current bearer', async () => {
    const store = createStore();
    const service = new AuthSessionService(store);

    await service.revokeCurrent('invalid');
    expect(store.revokeByTokenHash).not.toHaveBeenCalled();

    const issued = await service.issue('user-1', 'web');
    await service.revokeCurrent(issued.sessionToken);

    expect(store.revokeByTokenHash).toHaveBeenCalledWith(
      hashSessionToken(issued.sessionToken),
    );
  });
});
