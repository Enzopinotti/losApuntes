import { MongoNotificationStore } from './mongo-notification.store';

describe('B144 unread counter Mongo adapter', () => {
  it('counts only unread documents owned by the current account', async () => {
    const exec = jest.fn().mockResolvedValue(3);
    const countDocuments = jest.fn().mockReturnValue({ exec });
    const find = jest.fn();
    const notifications = { countDocuments, find };
    const store = new MongoNotificationStore(
      {} as never,
      notifications as never,
    );

    await expect(store.countUnread('owner-a')).resolves.toBe(3);
    expect(countDocuments).toHaveBeenCalledTimes(1);
    expect(countDocuments).toHaveBeenCalledWith({
      userId: 'owner-a',
      readAt: null,
    });
    expect(find).not.toHaveBeenCalled();
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('keeps accounts isolated, including an empty inbox', async () => {
    const exec = jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    const countDocuments = jest.fn().mockReturnValue({ exec });
    const store = new MongoNotificationStore(
      {} as never,
      { countDocuments } as never,
    );

    await expect(store.countUnread('owner-a')).resolves.toBe(2);
    await expect(store.countUnread('owner-b')).resolves.toBe(0);
    expect(countDocuments.mock.calls).toEqual([
      [{ userId: 'owner-a', readAt: null }],
      [{ userId: 'owner-b', readAt: null }],
    ]);
  });

  it('never turns a datastore outage into a misleading zero count', async () => {
    const exec = jest.fn().mockRejectedValue(new Error('storage-unavailable'));
    const countDocuments = jest.fn().mockReturnValue({ exec });
    const store = new MongoNotificationStore(
      {} as never,
      { countDocuments } as never,
    );

    await expect(store.countUnread('owner-a')).rejects.toThrow(
      'storage-unavailable',
    );
  });
});
