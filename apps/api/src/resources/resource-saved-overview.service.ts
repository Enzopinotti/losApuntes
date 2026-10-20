import {
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, PipelineStage } from 'mongoose';

import { boundedSavedQuery } from './domain/resource-saved-query-budget';
import { authorizedSavedJoinStages } from './mongo/saved-authorized-lookup-stages';
import { ResourceSave } from './mongo/resource.mongo-schemas';

const RECENT_SAVES_LIMIT = 5;
const OVERVIEW_AGGREGATION_TIMEOUT_MS = 8_000;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

interface CountFacet {
  count: number;
}

interface RecentSave {
  resourceId: string;
  subjectId: string;
  title: string;
  savedAt: Date;
}

interface SavedOverviewFacets {
  totals: CountFacet[];
  subjects: CountFacet[];
  recent: RecentSave[];
}

function count(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function invalidData(): never {
  throw new ServiceUnavailableException({
    code: 'RESOURCE_SAVED_OVERVIEW_DATA_INVALID',
    message: 'Saved library overview could not be read safely',
  });
}

/**
 * A saved relation is never an authorization grant. Match the authenticated
 * user, then apply the existing public/owned/shared + moderation joins
 * BEFORE counting, grouping, sorting or returning recent saved resources.
 */
@Injectable()
export class ResourceSavedOverviewService {
  constructor(
    @InjectModel(ResourceSave.name)
    private readonly saves: Model<ResourceSave>,
  ) {}

  async get(userId: string) {
    if (!userId || !userId.trim()) {
      throw new UnprocessableEntityException({
        code: 'RESOURCE_SAVED_OVERVIEW_OWNER_REQUIRED',
        message: 'An authenticated user is required',
      });
    }

    const pipeline: PipelineStage[] = [
      { $match: { userId } },
      { $project: { _id: 0, resourceId: 1, createdAt: 1 } },
      ...authorizedSavedJoinStages(userId),
      {
        $facet: {
          totals: [{ $count: 'count' }],
          subjects: [
            { $group: { _id: '$__resource.subjectId' } },
            { $count: 'count' },
          ],
          recent: [
            { $sort: { createdAt: -1, resourceId: 1 } },
            { $limit: RECENT_SAVES_LIMIT },
            {
              $project: {
                _id: 0,
                resourceId: 1,
                title: '$__resource.title',
                subjectId: '$__resource.subjectId',
                savedAt: '$createdAt',
              },
            },
          ],
        },
      },
    ];

    const response = await boundedSavedQuery(() =>
      this.saves
        .aggregate<SavedOverviewFacets>(pipeline)
        .option({
          allowDiskUse: true,
          maxTimeMS: OVERVIEW_AGGREGATION_TIMEOUT_MS,
        })
        .exec(),
    );

    if (
      !Array.isArray(response) ||
      response.length !== 1 ||
      !Array.isArray(response[0]?.totals) ||
      !Array.isArray(response[0]?.subjects) ||
      !Array.isArray(response[0]?.recent) ||
      response[0].totals.length > 1 ||
      response[0].subjects.length > 1 ||
      response[0].recent.length > RECENT_SAVES_LIMIT
    ) {
      return invalidData();
    }

    const { totals, subjects, recent } = response[0];
    const savedResourcesCount = totals.length ? totals[0]?.count : 0;
    const subjectsCount = subjects.length ? subjects[0]?.count : 0;

    if (
      !count(savedResourcesCount) ||
      !count(subjectsCount) ||
      subjectsCount > savedResourcesCount ||
      recent.length !== Math.min(savedResourcesCount, RECENT_SAVES_LIMIT)
    ) {
      return invalidData();
    }

    const seen = new Set<string>();
    for (let i = 0; i < recent.length; i += 1) {
      const item = recent[i];
      const previous = recent[i - 1];
      if (
        !item ||
        !UUID_V4.test(item.resourceId) ||
        seen.has(item.resourceId) ||
        typeof item.subjectId !== 'string' ||
        !item.subjectId.trim() ||
        typeof item.title !== 'string' ||
        !item.title.trim() ||
        !(item.savedAt instanceof Date) ||
        !Number.isFinite(item.savedAt.getTime()) ||
        (previous &&
          (previous.savedAt.getTime() < item.savedAt.getTime() ||
            (previous.savedAt.getTime() === item.savedAt.getTime() &&
              previous.resourceId >= item.resourceId)))
      ) {
        return invalidData();
      }
      seen.add(item.resourceId);
    }

    return {
      savedResourcesCount,
      subjectsCount,
      recentSavedResources: recent.map((item) => ({
        resourceId: item.resourceId,
        title: item.title,
        subjectId: item.subjectId,
        savedAt: item.savedAt.toISOString(),
      })),
    };
  }
}
