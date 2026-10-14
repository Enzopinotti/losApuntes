import type { PipelineStage } from 'mongoose';

/**
 * A saved relation is not an authorization grant.
 *
 * All saved discovery paths must join by the canonical indexed equality keys:
 * resources.id and resource_shares(resourceId, userId). This intentionally
 * keeps authorization in the pipeline BEFORE pagination or facet grouping.
 *
 * MongoDB 5.0+ supports the concise localField/foreignField + pipeline syntax.
 * The secondary projections discard descriptions, tags, searchText and any
 * other unneeded fields before carrying candidate rows into sorting/grouping.
 */
export function authorizedSavedJoinStages(
  userId: string,
  options: {
    searchRegex?: string;
    subjectId?: string;
    facets?: boolean;
  } = {},
): PipelineStage[] {
  return [
    {
      $lookup: {
        from: 'resources',
        localField: 'resourceId',
        foreignField: 'id',
        pipeline: [
          {
            $match: {
              moderationState: 'available',
              ...(options.searchRegex
                ? { searchText: { $regex: options.searchRegex, $options: 'i' } }
                : {}),
              ...(options.subjectId ? { subjectId: options.subjectId } : {}),
            },
          },
          {
            $project: {
              _id: 0,
              visibility: 1,
              authorUserId: 1,
              subjectId: 1,
              ...(options.facets ? {} : { title: 1 }),
            },
          },
        ],
        as: '__resource',
      },
    },
    { $unwind: '$__resource' },
    {
      $lookup: {
        from: 'resource_shares',
        localField: 'resourceId',
        foreignField: 'resourceId',
        pipeline: [
          { $match: { userId } },
          { $limit: 1 },
          { $project: { _id: 1 } },
        ],
        as: '__viewerShares',
      },
    },
    {
      $match: {
        $or: [
          { '__resource.visibility': 'public' },
          { '__resource.authorUserId': userId },
          {
            $and: [
              { '__resource.visibility': 'shared' },
              { '__viewerShares.0': { $exists: true } },
            ],
          },
        ],
      },
    },
  ];
}
