import type { AuthSessionDocument } from './schemas/auth-session.schema';
import { MongoAuthSessionStore } from './mongo-auth-session.store';

const NOW = new Date('2026-09-30T12:00:00.000Z');
const WEB_IDLE_AFTER = new Date('2026-09-29T12:00:00.000Z');
const MOBILE_IDLE_AFTER = new Date('2026-09-16T12:00:00.000Z');

function document(index: number): AuthSessionDocument {
  return {
    sessionId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    userId: 'user-1',
    tokenHash: String(index).padStart(64, 'a'),
    credentialVersion: 3,
    clientType: index % 2 === 0 ? 'web' : 'mobile',
    createdAt: new Date(NOW.getTime() - index * 10_000),
    lastSeenAt: new Date(NOW.getTime() - index * 1_000),
    expiresAt: new Date('2026-10-30T12:00:00.000Z'),
  } as AuthSessionDocument;
}

function inventoryQuery(documents: AuthSessionDocument[]) {
  const chain = {
    sort: jest.fn(),
    limit: jest.fn(),
    exec: jest.fn().mockResolvedValue(documents),
  };
  chain.sort.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  return chain;
}

describe('MongoAuthSessionStore bounded inventory', () => {
  it('queries only current credential + idle-valid sessions and uses limit+1', async () => {
    const docs = Array.from({ length: 21 }, (_, index) => document(index));
    const chain = inventoryQuery(docs);
    const model = {
      find: jest.fn().mockReturnValue(chain),
    };
    const store = new MongoAuthSessionStore(model as never);

    const result = await store.listActiveForUser({
      userId: 'user-1',
      credentialVersion: 3,
      now: NOW,
      webIdleAfter: WEB_IDLE_AFTER,
      mobileIdleAfter: MOBILE_IDLE_AFTER,
      limit: 20,
    });

    expect(model.find).toHaveBeenCalledWith({
      userId: 'user-1',
      credentialVersion: 3,
      expiresAt: { $gt: NOW },
      $or: [
        {
          clientType: 'web',
          lastSeenAt: { $gt: WEB_IDLE_AFTER },
        },
        {
          clientType: 'mobile',
          lastSeenAt: { $gt: MOBILE_IDLE_AFTER },
        },
      ],
    });
    expect(chain.sort).toHaveBeenCalledWith({
      lastSeenAt: -1,
      sessionId: -1,
    });
    expect(chain.limit).toHaveBeenCalledWith(21);
    expect(result.items).toHaveLength(20);
    expect(result.hasMore).toBe(true);
    expect(result.items[0]?.id).toBe(docs[0]?.sessionId);
  });

  it('does not report truncation at exactly the inventory budget', async () => {
    const docs = Array.from({ length: 20 }, (_, index) => document(index));
    const chain = inventoryQuery(docs);
    const model = {
      find: jest.fn().mockReturnValue(chain),
    };
    const store = new MongoAuthSessionStore(model as never);

    await expect(
      store.listActiveForUser({
        userId: 'user-1',
        credentialVersion: 3,
        now: NOW,
        webIdleAfter: WEB_IDLE_AFTER,
        mobileIdleAfter: MOBILE_IDLE_AFTER,
        limit: 20,
      }),
    ).resolves.toMatchObject({
      hasMore: false,
      items: expect.any(Array),
    });
  });

  it('looks up the current session with bounded account and credential scope', async () => {
    const doc = document(1);
    const exec = jest.fn().mockResolvedValue(doc);
    const model = {
      findOne: jest.fn().mockReturnValue({ exec }),
    };
    const store = new MongoAuthSessionStore(model as never);

    await expect(
      store.findActiveOwnedById('user-1', doc.sessionId, 3, NOW),
    ).resolves.toMatchObject({
      id: doc.sessionId,
      userId: 'user-1',
      credentialVersion: 3,
    });

    expect(model.findOne).toHaveBeenCalledWith({
      userId: 'user-1',
      sessionId: doc.sessionId,
      credentialVersion: 3,
      expiresAt: { $gt: NOW },
    });
  });
});
