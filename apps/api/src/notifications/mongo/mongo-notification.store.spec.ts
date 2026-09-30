import type { CreateNotificationRecord } from '../domain/notification.types';
import { MongoNotificationStore } from './mongo-notification.store';

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
});
