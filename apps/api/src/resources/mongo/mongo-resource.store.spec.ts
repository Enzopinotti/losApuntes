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
  });
});
