import { authorizedSavedJoinStages } from './saved-authorized-lookup-stages';
import {
  ResourceSaveSchema,
  ResourceSchema,
  ResourceShareSchema,
} from './resource.mongo-schemas';

describe('saved discovery indexed lookups', () => {
  const actor = 'viewer-1';

  it('uses the canonical indexed key for Resource and indexed resource+viewer share grant', () => {
    const stages = authorizedSavedJoinStages(actor, {
      searchRegex: '[aá]lgebra',
      subjectId: '11111111-1111-4111-8111-111111111111',
    });

    expect(stages).toHaveLength(4);
    expect(stages[0]).toEqual({
      $lookup: {
        from: 'resources',
        localField: 'resourceId',
        foreignField: 'id',
        pipeline: [
          {
            $match: {
              moderationState: 'available',
              searchText: { $regex: '[aá]lgebra', $options: 'i' },
              subjectId: '11111111-1111-4111-8111-111111111111',
            },
          },
          {
            $project: {
              _id: 0,
              visibility: 1,
              authorUserId: 1,
              subjectId: 1,
              title: 1,
            },
          },
        ],
        as: '__resource',
      },
    });

    expect(stages[1]).toEqual({ $unwind: '$__resource' });
    expect(stages[2]).toEqual({
      $lookup: {
        from: 'resource_shares',
        localField: 'resourceId',
        foreignField: 'resourceId',
        pipeline: [
          { $match: { userId: actor } },
          { $limit: 1 },
          { $project: { _id: 1 } },
        ],
        as: '__viewerShares',
      },
    });
  });

  it('requires public, owner or currently matching share after filtering moderation', () => {
    const stages = authorizedSavedJoinStages(actor);
    expect(stages[3]).toEqual({
      $match: {
        $or: [
          { '__resource.visibility': 'public' },
          { '__resource.authorUserId': actor },
          {
            $and: [
              { '__resource.visibility': 'shared' },
              { '__viewerShares.0': { $exists: true } },
            ],
          },
        ],
      },
    });
  });

  it('retains only fields needed to count accessible subjects', () => {
    const stages = authorizedSavedJoinStages(actor, { facets: true });
    const projection = (
      stages[0] as unknown as {
        $lookup: { pipeline: Array<Record<string, unknown>> };
      }
    ).$lookup.pipeline[1];

    expect(projection).toEqual({
      $project: {
        _id: 0,
        visibility: 1,
        authorUserId: 1,
        subjectId: 1,
      },
    });
    expect(JSON.stringify(stages)).not.toContain('searchText');
    expect(JSON.stringify(stages)).not.toContain('"title":1');
    expect(JSON.stringify(stages)).not.toContain('"description"');
    expect(JSON.stringify(stages)).not.toContain('"tags"');
  });

  it('relies on existing indexes without creating redundant indexes or a migration', () => {
    const hasCompoundIndex = (
      indexes: ReturnType<typeof ResourceSaveSchema.indexes>,
      keys: Record<string, number>,
    ) =>
      indexes.some(
        ([fields]) => JSON.stringify(fields) === JSON.stringify(keys),
      );

    expect(ResourceSchema.path('id').options.unique).toBe(true);
    expect(
      hasCompoundIndex(ResourceShareSchema.indexes(), {
        resourceId: 1,
        userId: 1,
      }),
    ).toBe(true);
    expect(
      hasCompoundIndex(ResourceSaveSchema.indexes(), {
        userId: 1,
        createdAt: -1,
        resourceId: 1,
      }),
    ).toBe(true);
    expect(
      hasCompoundIndex(ResourceSaveSchema.indexes(), {
        userId: 1,
        resourceId: 1,
      }),
    ).toBe(true);
  });
});
