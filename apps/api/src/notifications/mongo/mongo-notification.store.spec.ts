import type { CreateNotificationRecord } from '../domain/notification.types';
import { MongoNotificationStore } from './mongo-notification.store';

const now = new Date('2026-10-11T12:00:00.000Z');

function record(index: number): CreateNotificationRecord {
  return {
    id: `notification-${index}`,
    userId: `user-${index}`,
    type: 'social.followed',
    actorUserId: 'actor-user',
    targetType: 'profile',
    targetId: `profile-${index}`,
    readAt: null,
  };
}

describe('MongoNotificationStore fan-out persistence', () => {
  it('writes a bounded batch inside one transaction', async () => {
    const session = {
      withTransaction: jest.fn(async (callback: () => Promise<void>) =>
        callback(),
      ),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    const connection = {
      startSession: jest.fn().mockResolvedValue(session),
    };
    const notifications = {
      create: jest.fn().mockResolvedValue([]),
    };
    const store = new MongoNotificationStore(
      connection as never,
      notifications as never,
    );
    const records = [record(1), record(2)];

    await expect(store.createMany(records)).resolves.toBe(2);

    expect(connection.startSession).toHaveBeenCalledTimes(1);
    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(notifications.create).toHaveBeenCalledWith(records, { session });
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it('does not open a transaction for an empty batch', async () => {
    const connection = {
      startSession: jest.fn(),
    };
    const notifications = {
      create: jest.fn(),
    };
    const store = new MongoNotificationStore(
      connection as never,
      notifications as never,
    );

    await expect(store.createMany([])).resolves.toBe(0);

    expect(connection.startSession).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('reads only the owner export allowlist in stable bounded order', async () => {
    const first = {
      id: 'notification-1',
      type: 'social.followed' as const,
      actorUserId: 'actor-user',
      targetType: 'profile' as const,
      targetId: 'profile-target',
      readAt: null,
      createdAt: now,
    };
    const second = { ...first, id: 'notification-2' };
    const chain = {
      select: jest.fn(),
      sort: jest.fn(),
      limit: jest.fn(),
      lean: jest.fn(),
      exec: jest.fn().mockResolvedValue([first, second]),
    };
    chain.select.mockReturnValue(chain);
    chain.sort.mockReturnValue(chain);
    chain.limit.mockReturnValue(chain);
    chain.lean.mockReturnValue(chain);
    const notifications = {
      find: jest.fn(() => chain),
    };
    const store = new MongoNotificationStore(
      {} as never,
      notifications as never,
    );

    await expect(
      store.listForAccountExport({
        userId: 'owner-user',
        limit: 1,
        after: { createdAt: now, id: 'notification-0' },
      }),
    ).resolves.toEqual({ items: [first], hasMore: true });

    expect(notifications.find).toHaveBeenCalledWith({
      $and: [
        { userId: 'owner-user' },
        {
          $or: [
            { createdAt: { $lt: now } },
            { createdAt: now, id: { $gt: 'notification-0' } },
          ],
        },
      ],
    });
    expect(chain.select).toHaveBeenCalledWith({
      _id: 0,
      id: 1,
      type: 1,
      actorUserId: 1,
      targetType: 1,
      targetId: 1,
      readAt: 1,
      createdAt: 1,
    });
    expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1, id: 1 });
    expect(chain.limit).toHaveBeenCalledWith(2);
  });
});
