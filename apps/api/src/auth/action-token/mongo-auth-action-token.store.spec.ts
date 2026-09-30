import { MongoAuthActionTokenStore } from './mongo-auth-action-token.store';

const NOW = new Date('2026-09-30T16:30:00.000Z');

function retentionQuery(rows: Array<{ tokenId: string }>) {
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

describe('MongoAuthActionTokenStore bounded retention', () => {
  it('reads only the retained ids and invalidates every other active token', async () => {
    const query = retentionQuery([
      { tokenId: 'newest' },
      { tokenId: 'second' },
      { tokenId: 'third' },
    ]);
    const update = { exec: jest.fn().mockResolvedValue({ modifiedCount: 2 }) };
    const model = {
      find: jest.fn().mockReturnValue(query),
      updateMany: jest.fn().mockReturnValue(update),
    };
    const store = new MongoAuthActionTokenStore(model as never);

    await store.retainNewestActiveForUserPurpose(
      'user-1',
      'email_verification',
      NOW,
      3,
    );

    expect(model.find).toHaveBeenCalledWith({
      userId: 'user-1',
      purpose: 'email_verification',
      consumedAt: null,
      expiresAt: { $gt: NOW },
    });
    expect(query.sort).toHaveBeenCalledWith({
      createdAt: -1,
      tokenId: -1,
    });
    expect(query.limit).toHaveBeenCalledWith(3);
    expect(query.select).toHaveBeenCalledWith({ tokenId: 1 });
    expect(model.updateMany).toHaveBeenCalledWith(
      {
        userId: 'user-1',
        purpose: 'email_verification',
        consumedAt: null,
        expiresAt: { $gt: NOW },
        tokenId: { $nin: ['newest', 'second', 'third'] },
      },
      {
        $set: { consumedAt: NOW },
      },
    );
  });

  it('repairs an empty retained set without materializing active history', async () => {
    const query = retentionQuery([]);
    const update = { exec: jest.fn().mockResolvedValue({ modifiedCount: 0 }) };
    const model = {
      find: jest.fn().mockReturnValue(query),
      updateMany: jest.fn().mockReturnValue(update),
    };
    const store = new MongoAuthActionTokenStore(model as never);

    await store.retainNewestActiveForUserPurpose(
      'user-1',
      'password_recovery',
      NOW,
      3,
    );

    expect(query.limit).toHaveBeenCalledWith(3);
    expect(model.updateMany).toHaveBeenCalledWith(
      {
        userId: 'user-1',
        purpose: 'password_recovery',
        consumedAt: null,
        expiresAt: { $gt: NOW },
      },
      {
        $set: { consumedAt: NOW },
      },
    );
  });
});
