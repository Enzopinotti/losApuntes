import { MongoAuthActionTokenStore } from './mongo-auth-action-token.store';

const NOW = new Date('2026-09-30T15:00:00.000Z');

function boundedFind(rows: Array<{ tokenId: string; createdAt: Date }>) {
  const chain = {
    sort: jest.fn(),
    limit: jest.fn(),
    select: jest.fn(),
    lean: jest.fn(),
    exec: jest.fn().mockResolvedValue(rows),
  };
  chain.sort.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);
  return chain;
}

describe('MongoAuthActionTokenStore bounded overflow trimming', () => {
  it('reads only the retained set and invalidates every other active token', async () => {
    const findChain = boundedFind([
      { tokenId: 'newest', createdAt: new Date('2026-09-30T14:59:00.000Z') },
      { tokenId: 'second', createdAt: new Date('2026-09-30T14:58:00.000Z') },
      { tokenId: 'third', createdAt: new Date('2026-09-30T14:57:00.000Z') },
    ]);
    const updateExec = jest.fn().mockResolvedValue({ modifiedCount: 17 });
    const model = {
      find: jest.fn().mockReturnValue(findChain),
      updateMany: jest.fn().mockReturnValue({ exec: updateExec }),
    };
    const store = new MongoAuthActionTokenStore(model as never);

    await store.trimActiveForUserPurpose(
      'user-1',
      'email_verification',
      NOW,
      3,
      NOW,
    );

    expect(model.find).toHaveBeenCalledWith({
      userId: 'user-1',
      purpose: 'email_verification',
      consumedAt: null,
      expiresAt: { $gt: NOW },
    });
    expect(findChain.sort).toHaveBeenCalledWith({
      createdAt: -1,
      tokenId: -1,
    });
    expect(findChain.limit).toHaveBeenCalledWith(3);
    expect(findChain.select).toHaveBeenCalledWith({
      tokenId: 1,
      createdAt: 1,
      _id: 0,
    });

    expect(model.updateMany).toHaveBeenCalledWith(
      {
        userId: 'user-1',
        purpose: 'email_verification',
        consumedAt: null,
        expiresAt: { $gt: NOW },
        $or: [
          { createdAt: { $lt: new Date('2026-09-30T14:57:00.000Z') } },
          {
            createdAt: new Date('2026-09-30T14:57:00.000Z'),
            tokenId: { $lt: 'third' },
          },
        ],
      },
      {
        $set: { consumedAt: NOW },
      },
    );
    expect(updateExec).toHaveBeenCalledTimes(1);
  });

  it('does not issue an overflow update when fewer than the retained budget exist', async () => {
    const findChain = boundedFind([
      { tokenId: 'newest', createdAt: new Date('2026-09-30T14:59:00.000Z') },
      { tokenId: 'second', createdAt: new Date('2026-09-30T14:58:00.000Z') },
    ]);
    const model = {
      find: jest.fn().mockReturnValue(findChain),
      updateMany: jest.fn(),
    };
    const store = new MongoAuthActionTokenStore(model as never);

    await store.trimActiveForUserPurpose(
      'user-1',
      'password_recovery',
      NOW,
      3,
      NOW,
    );

    expect(model.updateMany).not.toHaveBeenCalled();
  });
});
