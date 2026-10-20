import { MongoSocialStore } from './mongo-social.store';
import { SocialConnectionSchema } from './social.mongo-schemas';

const at = new Date('2026-10-20T00:00:00.000Z');
const id = '11111111-1111-4111-8111-111111111111';

function setup(rows: unknown[] = [], count = 3) {
  const chain = {
    sort: jest.fn(),
    limit: jest.fn(),
    lean: jest.fn(),
    exec: jest.fn().mockResolvedValue(rows),
  };
  chain.sort.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);
  const countExec = jest.fn().mockResolvedValue(count);
  const connections = {
    find: jest.fn().mockReturnValue(chain),
    countDocuments: jest.fn().mockReturnValue({ exec: countExec }),
  };
  const store = new MongoSocialStore(
    {} as never,
    {} as never,
    connections as never,
    {} as never,
    {} as never,
  );
  return { store, connections, chain, countExec };
}

describe('B147 Mongo private connection requests', () => {
  it('filters incoming by both participants, pending status and opposite requester', async () => {
    const { store, connections, chain } = setup();
    await expect(
      store.listConnections('owner-a', 'pending', 26, { at, id }, 'incoming'),
    ).resolves.toEqual([]);
    expect(connections.find).toHaveBeenCalledWith({
      $and: [
        { $or: [{ userLowId: 'owner-a' }, { userHighId: 'owner-a' }] },
        { status: 'pending' },
        { status: 'pending' },
        { requestedByUserId: { $ne: 'owner-a' } },
        {
          $or: [
            { updatedAt: { $lt: at } },
            { updatedAt: at, id: { $gt: id } },
          ],
        },
      ],
    });
    expect(chain.sort).toHaveBeenCalledWith({ updatedAt: -1, id: 1 });
    expect(chain.limit).toHaveBeenCalledWith(26);
  });

  it('filters outgoing in Mongo rather than discarding entries after paging', async () => {
    const { store, connections } = setup();
    await store.listConnections('owner-b', 'pending', 4, undefined, 'outgoing');
    expect(connections.find).toHaveBeenCalledWith({
      $and: [
        { $or: [{ userLowId: 'owner-b' }, { userHighId: 'owner-b' }] },
        { status: 'pending' },
        { status: 'pending' },
        { requestedByUserId: 'owner-b' },
      ],
    });
  });

  it('does not alter legacy unfiltered connection listing', async () => {
    const { store, connections } = setup();
    await store.listConnections('owner-a', 'accepted', 30);
    expect(connections.find).toHaveBeenCalledWith({
      $and: [
        { $or: [{ userLowId: 'owner-a' }, { userHighId: 'owner-a' }] },
        { status: 'accepted' },
      ],
    });
  });

  it('counts only received pending requests, never sent ones', async () => {
    const { store, connections, countExec } = setup([], 7);
    await expect(store.countIncomingConnectionRequests('owner-a'))
      .resolves.toBe(7);
    expect(connections.countDocuments).toHaveBeenCalledWith({
      status: 'pending',
      requestedByUserId: { $ne: 'owner-a' },
      $or: [{ userLowId: 'owner-a' }, { userHighId: 'owner-a' }],
    });
    expect(countExec).toHaveBeenCalledTimes(1);
    expect(connections.find).not.toHaveBeenCalled();
  });

  it('declares two compound indexes for both participant positions', () => {
    const indexes = SocialConnectionSchema.indexes();
    expect(indexes).toEqual(
      expect.arrayContaining([
        [
          {
            userLowId: 1,
            status: 1,
            requestedByUserId: 1,
            updatedAt: -1,
            id: 1,
          },
          { background: true },
        ],
        [
          {
            userHighId: 1,
            status: 1,
            requestedByUserId: 1,
            updatedAt: -1,
            id: 1,
          },
          { background: true },
        ],
      ]),
    );
  });
});
