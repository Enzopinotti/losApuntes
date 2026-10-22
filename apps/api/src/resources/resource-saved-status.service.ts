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

export const SAVED_STATUS_MAX_RESOURCES = 50;
export const SAVED_STATUS_QUERY_TIMEOUT_MS = 8_000;

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function invalidInput(): never {
  throw new UnprocessableEntityException({
    code: 'RESOURCE_SAVED_STATUS_INPUT_INVALID',
    message: 'Specify between 1 and 50 distinct resource UUIDs',
  });
}

function invalidData(): never {
  throw new ServiceUnavailableException({
    code: 'RESOURCE_SAVED_STATUS_DATA_INVALID',
    message: 'Saved status could not be determined safely',
  });
}

/**
 * Read-only batch state for resource cards.
 * Bookmark existence is NOT a permission: the existing authorized joins
 * filter moderation and current visibility before considering a save true.
 */
@Injectable()
export class ResourceSavedStatusService {
  constructor(
    @InjectModel(ResourceSave.name)
    private readonly saves: Model<ResourceSave>,
  ) {}

  async check(ownerUserId: string, resourceIds: string[]) {
    if (!ownerUserId || !ownerUserId.trim()) return invalidInput();
    if (
      !Array.isArray(resourceIds) ||
      resourceIds.length < 1 ||
      resourceIds.length > SAVED_STATUS_MAX_RESOURCES ||
      !resourceIds.every((id) => typeof id === 'string' && UUID_V4.test(id)) ||
      new Set(resourceIds.map((id) => id.toLowerCase())).size !==
        resourceIds.length
    ) {
      return invalidInput();
    }

    const canonicalResourceIds = resourceIds.map((id) => id.toLowerCase());
    const pipeline: PipelineStage[] = [
      {
        $match: {
          userId: ownerUserId,
          resourceId: { $in: canonicalResourceIds },
        },
      },
      { $project: { _id: 0, resourceId: 1 } },
      ...authorizedSavedJoinStages(ownerUserId, { facets: true }),
      // Authorization above must happen before this bound. A duplicated
      // authorized save is corruption, not a reason to silently truncate.
      { $limit: resourceIds.length + 1 },
      { $project: { _id: 0, resourceId: 1 } },
    ];

    const found = await boundedSavedQuery(() =>
      this.saves
        .aggregate<{ resourceId: string }>(pipeline)
        .option({ maxTimeMS: SAVED_STATUS_QUERY_TIMEOUT_MS })
        .exec(),
    );

    if (!Array.isArray(found) || found.length > resourceIds.length) {
      return invalidData();
    }

    const inputIds = new Set(canonicalResourceIds);
    const allowed = new Set<string>();
    for (const entry of found) {
      if (
        !entry ||
        typeof entry.resourceId !== 'string' ||
        !UUID_V4.test(entry.resourceId) ||
        !inputIds.has(entry.resourceId.toLowerCase()) ||
        allowed.has(entry.resourceId.toLowerCase())
      ) {
        return invalidData();
      }
      allowed.add(entry.resourceId.toLowerCase());
    }

    // An absent edge, hidden/deleted/moderated resource or revoked share
    // all project to false. No reason, userId or grant state escapes.
    return {
      items: resourceIds.map((resourceId) => ({
        resourceId,
        isSaved: allowed.has(resourceId.toLowerCase()),
      })),
    };
  }
}
