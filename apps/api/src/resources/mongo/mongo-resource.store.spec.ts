import { MongoResourceStore } from './mongo-resource.store';

describe('MongoResourceStore authorization pipeline', () => {
  it('scopes explicit shares to the current outer resource', async () => {
    const exec = jest.fn().mockResolvedValue([]);
    const aggregate = jest.fn().mockReturnValue({ exec });

    const store = new MongoResourceStore(
      {} as never,
      { aggregate } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await store.searchAuthorized({
      viewerUserId: 'viewer-1',
      visibility: 'shared',
      limit: 25,
    });

    const pipeline = aggregate.mock.calls[0]?.[0] as unknown[];
    expect(pipeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          $lookup: expect.objectContaining({
            from: 'resource_shares',
            let: { resourceId: '$id' },
            pipeline: expect.arrayContaining([
              expect.objectContaining({
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$resourceId', '$$resourceId'] },
                      { $eq: ['$userId', 'viewer-1'] },
                    ],
                  },
                },
              }),
            ]),
          }),
        }),
      ]),
    );

    expect(pipeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          $match: {
            $or: expect.arrayContaining([
              {
                $and: [
                  { visibility: 'shared' },
                  { '__viewerShares.0': { $exists: true } },
                ],
              },
            ]),
          },
        }),
      ]),
    );
  });

  it('clears explicit grants transactionally when visibility leaves shared', async () => {
    const updated = {
      id: '11111111-1111-4111-8111-111111111111',
      visibility: 'private',
      revision: 2,
    };
    const updateExec = jest.fn().mockResolvedValue(updated);
    const lean = jest.fn().mockReturnValue({ exec: updateExec });
    const findOneAndUpdate = jest.fn().mockReturnValue({ lean });
    const deleteExec = jest.fn().mockResolvedValue({ deletedCount: 2 });
    const deleteMany = jest.fn().mockReturnValue({ exec: deleteExec });
    const session = {
      withTransaction: jest.fn(async (operation: () => Promise<void>) =>
        operation(),
      ),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    const startSession = jest.fn().mockResolvedValue(session);

    const store = new MongoResourceStore(
      { startSession } as never,
      { findOneAndUpdate } as never,
      { deleteMany } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      store.updateOwned(
        updated.id,
        'author-1',
        1,
        { visibility: 'private' },
      ),
    ).resolves.toEqual(updated);

    expect(startSession).toHaveBeenCalledTimes(1);
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { id: updated.id, authorUserId: 'author-1', revision: 1 },
      {
        $set: { visibility: 'private' },
        $inc: { revision: 1 },
      },
      { new: true, session },
    );
    expect(deleteMany).toHaveBeenCalledWith(
      { resourceId: updated.id },
      { session },
    );
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it('does not clear grants when visibility remains shared', async () => {
    const updated = {
      id: '11111111-1111-4111-8111-111111111111',
      visibility: 'shared',
      revision: 2,
    };
    const exec = jest.fn().mockResolvedValue(updated);
    const lean = jest.fn().mockReturnValue({ exec });
    const findOneAndUpdate = jest.fn().mockReturnValue({ lean });
    const startSession = jest.fn();

    const store = new MongoResourceStore(
      { startSession } as never,
      { findOneAndUpdate } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      store.updateOwned(
        updated.id,
        'author-1',
        1,
        { visibility: 'shared' },
      ),
    ).resolves.toEqual(updated);

    expect(startSession).not.toHaveBeenCalled();
  });

});
