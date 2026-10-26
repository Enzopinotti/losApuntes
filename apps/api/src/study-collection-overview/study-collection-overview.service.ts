import {
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, PipelineStage } from 'mongoose';

import { STUDY_COLLECTION_MAX_ITEMS } from '../study-collections/domain/study-collection.store';
import { StudyCollection } from '../study-collections/mongo/study-collection.mongo-schema';

const RECENT_LIMIT = 5;
const MAX_QUERY_TIME_MS = 5000;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

interface OverviewMetrics {
  collectionsCount: number;
  collectionsWithResources: number;
  fullCollectionsCount: number;
  storedResourceReferences: number;
  invalidCollectionsCount: number;
}

interface RecentCollection {
  id: string;
  ownerUserId: string;
  title: string;
  revision: number;
  referenceCount: number;
  updatedAt: Date;
}

interface OverviewAggregateResult {
  totals: OverviewMetrics[];
  recent: RecentCollection[];
}

function invalidData(): never {
  throw new ServiceUnavailableException({
    code: 'STUDY_COLLECTION_OVERVIEW_DATA_INVALID',
    message: 'Study collection overview could not be read safely',
  });
}

function isSafeCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

/**
 * One owner-scoped read. A pre-facet sort uses the owner+updatedAt+id index;
 * Mongo's facet produces one aggregate total and up to five recent records.
 * No referenced Resources are read or implied to remain accessible.
 */
@Injectable()
export class StudyCollectionOverviewService {
  constructor(
    @InjectModel(StudyCollection.name)
    private readonly collections: Model<StudyCollection>,
  ) {}

  async get(ownerUserId: string) {
    if (!ownerUserId || !ownerUserId.trim()) {
      throw new UnprocessableEntityException({
        code: 'STUDY_COLLECTION_OVERVIEW_OWNER_REQUIRED',
        message: 'Authenticated account is required',
      });
    }

    const pipeline: PipelineStage[] = [
      { $match: { ownerUserId } },
      { $sort: { updatedAt: -1, id: 1 } },
      {
        $project: {
          _id: 0,
          id: 1,
          ownerUserId: 1,
          title: 1,
          revision: 1,
          updatedAt: 1,
          referenceCount: {
            $cond: [
              { $isArray: '$resourceIds' },
              { $size: '$resourceIds' },
              -1,
            ],
          },
          duplicateReferences: {
            $cond: [
              { $isArray: '$resourceIds' },
              {
                $subtract: [
                  { $size: '$resourceIds' },
                  { $size: { $setUnion: ['$resourceIds', []] } },
                ],
              },
              0,
            ],
          },
          invalidMetadata: {
            $cond: [
              {
                $or: [
                  { $ne: [{ $type: '$id' }, 'string'] },
                  { $ne: [{ $type: '$title' }, 'string'] },
                  { $ne: [{ $type: '$updatedAt' }, 'date'] },
                  { $lt: ['$revision', 1] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                collectionsCount: { $sum: 1 },
                collectionsWithResources: {
                  $sum: { $cond: [{ $gt: ['$referenceCount', 0] }, 1, 0] },
                },
                fullCollectionsCount: {
                  $sum: {
                    $cond: [
                      { $eq: ['$referenceCount', STUDY_COLLECTION_MAX_ITEMS] },
                      1,
                      0,
                    ],
                  },
                },
                storedResourceReferences: { $sum: '$referenceCount' },
                invalidCollectionsCount: {
                  $sum: {
                    $cond: [
                      {
                        $or: [
                          { $lt: ['$referenceCount', 0] },
                          {
                            $gt: [
                              '$referenceCount',
                              STUDY_COLLECTION_MAX_ITEMS,
                            ],
                          },
                          { $gt: ['$duplicateReferences', 0] },
                          { $gt: ['$invalidMetadata', 0] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
            { $project: { _id: 0 } },
          ],
          recent: [
            { $limit: RECENT_LIMIT },
            {
              $project: {
                _id: 0,
                id: 1,
                ownerUserId: 1,
                title: 1,
                revision: 1,
                referenceCount: 1,
                updatedAt: 1,
              },
            },
          ],
        },
      },
    ];

    const result = await this.collections
      .aggregate<OverviewAggregateResult>(pipeline)
      .option({ maxTimeMS: MAX_QUERY_TIME_MS })
      .exec();
    if (
      !Array.isArray(result) ||
      result.length !== 1 ||
      !Array.isArray(result[0]?.totals) ||
      !Array.isArray(result[0]?.recent) ||
      result[0].totals.length > 1 ||
      result[0].recent.length > RECENT_LIMIT
    ) {
      return invalidData();
    }

    const { totals, recent } = result[0];
    const summary: OverviewMetrics =
      totals.length === 0
        ? {
            collectionsCount: 0,
            collectionsWithResources: 0,
            fullCollectionsCount: 0,
            storedResourceReferences: 0,
            invalidCollectionsCount: 0,
          }
        : totals[0];

    if (
      !summary ||
      !isSafeCount(summary.collectionsCount) ||
      !isSafeCount(summary.collectionsWithResources) ||
      !isSafeCount(summary.fullCollectionsCount) ||
      !isSafeCount(summary.storedResourceReferences) ||
      !isSafeCount(summary.invalidCollectionsCount) ||
      summary.invalidCollectionsCount !== 0 ||
      summary.collectionsWithResources > summary.collectionsCount ||
      summary.fullCollectionsCount > summary.collectionsWithResources ||
      summary.storedResourceReferences < summary.collectionsWithResources ||
      summary.storedResourceReferences >
        summary.collectionsCount * STUDY_COLLECTION_MAX_ITEMS ||
      recent.length > summary.collectionsCount ||
      (summary.collectionsCount > 0 && recent.length === 0)
    ) {
      return invalidData();
    }

    const seen = new Set<string>();
    for (const row of recent) {
      if (
        !row ||
        !UUID_V4.test(row.id) ||
        seen.has(row.id) ||
        row.ownerUserId !== ownerUserId ||
        typeof row.title !== 'string' ||
        row.title.trim().length < 1 ||
        row.title.length > 100 ||
        !Number.isSafeInteger(row.revision) ||
        row.revision < 1 ||
        !isSafeCount(row.referenceCount) ||
        row.referenceCount > STUDY_COLLECTION_MAX_ITEMS ||
        !(row.updatedAt instanceof Date) ||
        !Number.isFinite(row.updatedAt.getTime())
      ) {
        return invalidData();
      }
      seen.add(row.id);
    }

    return {
      collectionsCount: summary.collectionsCount,
      collectionsWithResources: summary.collectionsWithResources,
      fullCollectionsCount: summary.fullCollectionsCount,
      storedResourceReferences: summary.storedResourceReferences,
      recentCollections: recent.map((row) => ({
        id: row.id,
        title: row.title,
        resourceCount: row.referenceCount,
        revision: row.revision,
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }
}
