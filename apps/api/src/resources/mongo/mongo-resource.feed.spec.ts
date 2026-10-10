import { MongoResourceStore } from './mongo-resource.store';

describe('MongoResourceStore feed candidate authorization', () => {
  it('requires a Resource-scoped share and shared visibility', async () => {
    let capturedPipeline: unknown;
    const aggregate = jest.fn((pipeline: unknown) => {
      capturedPipeline = pipeline;
      return { exec: jest.fn().mockResolvedValue([]) };
    });
    const store = new MongoResourceStore(
      {} as never,
      { aggregate } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      store.listFeedCandidates({
        viewerUserId: 'viewer-1',
        anchorAt: new Date('2026-10-01T12:00:00.000Z'),
        limit: 20,
      }),
    ).resolves.toEqual([]);

    expect(Array.isArray(capturedPipeline)).toBe(true);
    const stages = capturedPipeline as Array<Record<string, unknown>>;
    const lookupStage = stages.find(
      (stage) => typeof stage.$lookup === 'object' && stage.$lookup !== null,
    );
    const lookup = lookupStage?.$lookup as
      | {
          from: string;
          let: Record<string, string>;
          pipeline: Array<Record<string, unknown>>;
        }
      | undefined;

    expect(lookup).toMatchObject({
      from: 'resource_shares',
      let: { resourceId: '$id' },
    });
    expect(lookup?.pipeline[0]).toEqual({
      $match: {
        $expr: {
          $and: [
            { $eq: ['$resourceId', '$$resourceId'] },
            { $eq: ['$userId', 'viewer-1'] },
          ],
        },
      },
    });

    const authorizationStage = stages.find((stage) => {
      const match = stage.$match;
      return typeof match === 'object' && match !== null && '$or' in match;
    }) as { $match: unknown } | undefined;

    expect(authorizationStage?.$match).toEqual({
      $or: [
        { visibility: 'public' },
        {
          $and: [
            { visibility: 'shared' },
            { '__viewerShares.0': { $exists: true } },
          ],
        },
      ],
    });
  });
});
