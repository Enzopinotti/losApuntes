import {
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { FilterQuery, Model } from 'mongoose';

import { ResourceService } from '../../resources/domain/resource.service';
import { StudyCollection } from '../mongo/study-collection.mongo-schema';
import {
  decodeMembershipCursor,
  encodeMembershipCursor,
} from './study-collection-membership.cursor';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const MAX_PAGE = 25;
const MAX_COLLECTION_ITEMS = 100;

interface MembershipRow {
  id: string;
  ownerUserId: string;
  title: string;
  revision: number;
  resourceIds: string[];
  updatedAt: Date;
}

function unsafe(): never {
  throw new ServiceUnavailableException({
    code: 'STUDY_COLLECTION_MEMBERSHIP_DATA_INVALID',
    message: 'Collection membership could not be read safely',
  });
}

/**
 * Resource access is checked BEFORE reading any membership. Collection
 * owner + resource membership are database predicates before limit+1.
 */
@Injectable()
export class StudyCollectionMembershipService {
  constructor(
    @InjectModel(StudyCollection.name)
    private readonly collections: Model<StudyCollection>,
    private readonly resources: ResourceService,
  ) {}

  async list(
    ownerUserId: string,
    resourceId: string,
    input: { limit: number; cursor?: string },
  ) {
    if (!ownerUserId || !ownerUserId.trim()) {
      throw new UnprocessableEntityException({
        code: 'STUDY_COLLECTION_MEMBERSHIP_OWNER_REQUIRED',
        message: 'Authenticated account is required',
      });
    }
    if (!UUID_V4.test(resourceId)) {
      throw new UnprocessableEntityException({
        code: 'STUDY_COLLECTION_MEMBERSHIP_RESOURCE_INVALID',
        message: 'Resource identifier is invalid',
      });
    }
    if (
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > MAX_PAGE
    ) {
      throw new UnprocessableEntityException({
        code: 'STUDY_COLLECTION_MEMBERSHIP_LIMIT_INVALID',
        message: 'Membership page size must be between 1 and 25',
      });
    }
    const canonicalResourceId = resourceId.toLowerCase();
    const after = decodeMembershipCursor(
      ownerUserId,
      canonicalResourceId,
      input.cursor,
    );

    // A resource identifier is not an access grant. Deny a missing or
    // unreadable resource using existing ResourceService authority.
    await this.resources.get(canonicalResourceId, ownerUserId);

    const filters: FilterQuery<StudyCollection>[] = [
      { ownerUserId },
      { resourceIds: canonicalResourceId },
    ];
    if (after) {
      filters.push({
        $or: [
          { updatedAt: { $lt: after.updatedAt } },
          { updatedAt: after.updatedAt, id: { $gt: after.id } },
        ],
      });
    }

    const rows = await this.collections
      .find({ $and: filters })
      .select({
        _id: 0,
        id: 1,
        ownerUserId: 1,
        title: 1,
        revision: 1,
        resourceIds: 1,
        updatedAt: 1,
      })
      .sort({ updatedAt: -1, id: 1 })
      .limit(input.limit + 1)
      .lean<MembershipRow[]>()
      .maxTimeMS(5000)
      .exec();

    if (!Array.isArray(rows) || rows.length > input.limit + 1) {
      return unsafe();
    }
    for (const row of rows) {
      if (
        !row ||
        !UUID_V4.test(row.id) ||
        row.ownerUserId !== ownerUserId ||
        typeof row.title !== 'string' ||
        !row.title.trim() ||
        row.title.length > 100 ||
        !Number.isSafeInteger(row.revision) ||
        row.revision < 1 ||
        !Array.isArray(row.resourceIds) ||
        row.resourceIds.length > MAX_COLLECTION_ITEMS ||
        !row.resourceIds.includes(canonicalResourceId) ||
        row.resourceIds.some(
          (id) => typeof id !== 'string' || !UUID_V4.test(id),
        ) ||
        new Set(row.resourceIds).size !== row.resourceIds.length ||
        !(row.updatedAt instanceof Date) ||
        !Number.isFinite(row.updatedAt.getTime())
      ) {
        return unsafe();
      }
    }

    const page = rows.slice(0, input.limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => ({
        id: row.id,
        title: row.title,
        resourceCount: row.resourceIds.length,
        revision: row.revision,
        updatedAt: row.updatedAt.toISOString(),
      })),
      nextCursor:
        rows.length > input.limit && last
          ? encodeMembershipCursor(ownerUserId, canonicalResourceId, {
              updatedAt: last.updatedAt,
              id: last.id,
            })
          : null,
    };
  }
}
