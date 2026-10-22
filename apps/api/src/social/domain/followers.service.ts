import {
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { FilterQuery, Model } from 'mongoose';

import { ProfileService } from '../../profile/domain/profile.service';
import { SocialFollow } from '../mongo/social.mongo-schemas';
import {
  decodeFollowersCursor,
  encodeFollowersCursor,
} from './followers.cursor';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_PAGE = 25;

interface FollowerRow {
  id: string;
  followerUserId: string;
  followeeUserId: string;
  createdAt: Date;
}

function unavailable(): never {
  throw new ServiceUnavailableException({
    code: 'SOCIAL_FOLLOWERS_DATA_INVALID',
    message: 'Followers could not be read safely',
  });
}

@Injectable()
export class FollowersService {
  constructor(
    @InjectModel(SocialFollow.name)
    private readonly follows: Model<SocialFollow>,
    private readonly profiles: ProfileService,
  ) {}

  async list(ownerUserId: string, limit: number, cursor?: string) {
    if (!ownerUserId || !ownerUserId.trim()) {
      throw new UnprocessableEntityException({
        code: 'SOCIAL_FOLLOWERS_OWNER_REQUIRED',
        message: 'Authenticated account is required',
      });
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE) {
      throw new UnprocessableEntityException({
        code: 'SOCIAL_FOLLOWERS_LIMIT_INVALID',
        message: 'Followers page size must be between 1 and 25',
      });
    }
    const after = decodeFollowersCursor(ownerUserId, cursor);

    const filters: FilterQuery<SocialFollow>[] = [
      { followeeUserId: ownerUserId },
    ];
    if (after) {
      filters.push({
        $or: [
          { createdAt: { $lt: after.at } },
          { createdAt: after.at, id: { $gt: after.id } },
        ],
      });
    }

    const rows = await this.follows
      .find({ $and: filters })
      .select({
        _id: 0,
        id: 1,
        followerUserId: 1,
        followeeUserId: 1,
        createdAt: 1,
      })
      .sort({ createdAt: -1, id: 1 })
      .limit(limit + 1)
      .lean<FollowerRow[]>()
      .exec();

    if (!Array.isArray(rows) || rows.length > limit + 1) {
      return unavailable();
    }
    for (const row of rows) {
      if (
        !row ||
        !UUID_V4.test(row.id) ||
        typeof row.followerUserId !== 'string' ||
        !row.followerUserId.trim() ||
        row.followerUserId === ownerUserId ||
        row.followeeUserId !== ownerUserId ||
        !(row.createdAt instanceof Date) ||
        !Number.isFinite(row.createdAt.getTime())
      ) {
        return unavailable();
      }
    }
    const pageRows = rows.slice(0, limit);
    const attributions = pageRows.length
      ? await this.profiles.getAttributionsForUsers(
          pageRows.map((row) => row.followerUserId),
        )
      : new Map<
          string,
          Awaited<ReturnType<ProfileService['getAttributionForUser']>>
        >();
    const items = pageRows.flatMap((row) => {
      const profile = attributions.get(row.followerUserId);
      // Accounts without a retrievable Profile are not returned. The cursor
      // still advances over scanned rows, so repeated requests terminate.
      return profile
        ? [{ profile, followedAt: row.createdAt.toISOString() }]
        : [];
    });
    const last = pageRows.at(-1);

    return {
      items,
      nextCursor:
        rows.length > limit && last
          ? encodeFollowersCursor(ownerUserId, {
              at: last.createdAt,
              id: last.id,
            })
          : null,
    };
  }

  async count(ownerUserId: string) {
    if (!ownerUserId || !ownerUserId.trim()) {
      throw new UnprocessableEntityException({
        code: 'SOCIAL_FOLLOWERS_OWNER_REQUIRED',
        message: 'Authenticated account is required',
      });
    }
    const followersCount = await this.follows
      .countDocuments({ followeeUserId: ownerUserId })
      .exec();
    if (!Number.isSafeInteger(followersCount) || followersCount < 0) {
      return unavailable();
    }
    return { followersCount };
  }
}
