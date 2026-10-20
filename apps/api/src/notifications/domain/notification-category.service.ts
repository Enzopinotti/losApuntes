import {
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { FilterQuery, Model } from 'mongoose';

import { ProfileService } from '../../profile/domain/profile.service';
import { Notification } from '../mongo/notification.mongo-schema';
import {
  assertNotificationCategory,
  CATEGORY_NOTIFICATION_TYPES,
  CATEGORY_TARGET_TYPES,
  decodeNotificationCategoryCursor,
  encodeNotificationCategoryCursor,
} from './notification-category.cursor';
import type { NotificationRecord } from './notification.types';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_PAGE = 30;

type CategoryRow = Pick<
  NotificationRecord,
  | 'id'
  | 'userId'
  | 'type'
  | 'actorUserId'
  | 'targetType'
  | 'targetId'
  | 'readAt'
  | 'createdAt'
>;

function unavailable(): never {
  throw new ServiceUnavailableException({
    code: 'NOTIFICATION_CATEGORY_DATA_INVALID',
    message: 'Notification category could not be read safely',
  });
}

/**
 * Read-only category views. They use the existing Notification collection and
 * Profile's public attribution rules, with owner filtering before pagination.
 */
@Injectable()
export class NotificationCategoryService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notifications: Model<Notification>,
    private readonly profiles: ProfileService,
  ) {}

  async list(
    ownerUserId: string,
    category: string,
    input: { unreadOnly: boolean; limit: number; cursor?: string },
  ) {
    this.assertOwner(ownerUserId);
    assertNotificationCategory(category);
    if (
      typeof input.unreadOnly !== 'boolean' ||
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > MAX_PAGE
    ) {
      throw new UnprocessableEntityException({
        code: 'NOTIFICATION_CATEGORY_PAGE_INVALID',
        message: 'Category page parameters are invalid',
      });
    }
    const after = decodeNotificationCategoryCursor(
      ownerUserId,
      category,
      input.unreadOnly,
      input.cursor,
    );
    const filters: FilterQuery<Notification>[] = [
      { userId: ownerUserId },
      { type: { $in: [...CATEGORY_NOTIFICATION_TYPES[category]] } },
    ];
    if (input.unreadOnly) filters.push({ readAt: null });
    if (after) {
      filters.push({
        $or: [
          { createdAt: { $lt: after.createdAt } },
          { createdAt: after.createdAt, id: { $gt: after.id } },
        ],
      });
    }

    const rows = await this.notifications
      .find({ $and: filters })
      .select({
        _id: 0,
        id: 1,
        userId: 1,
        type: 1,
        actorUserId: 1,
        targetType: 1,
        targetId: 1,
        readAt: 1,
        createdAt: 1,
      })
      .sort({ createdAt: -1, id: 1 })
      .limit(input.limit + 1)
      .lean<CategoryRow[]>()
      .exec();

    if (!Array.isArray(rows) || rows.length > input.limit + 1) {
      return unavailable();
    }
    const allowedTypes: readonly string[] = CATEGORY_NOTIFICATION_TYPES[category];
    for (const row of rows) {
      if (
        !row ||
        row.userId !== ownerUserId ||
        !UUID_V4.test(row.id) ||
        !allowedTypes.includes(row.type) ||
        row.targetType !== CATEGORY_TARGET_TYPES[row.type] ||
        !UUID_V4.test(row.targetId) ||
        (row.actorUserId !== null &&
          (typeof row.actorUserId !== 'string' ||
            !row.actorUserId.trim())) ||
        (row.readAt !== null &&
          (!(row.readAt instanceof Date) ||
            !Number.isFinite(row.readAt.getTime()))) ||
        (input.unreadOnly && row.readAt !== null) ||
        !(row.createdAt instanceof Date) ||
        !Number.isFinite(row.createdAt.getTime())
      ) {
        return unavailable();
      }
    }

    const page = rows.slice(0, input.limit);
    const actorUserIds = page.flatMap((row) =>
      row.actorUserId === null ? [] : [row.actorUserId],
    );
    const attributions = actorUserIds.length
      ? await this.profiles.getAttributionsForUsers(actorUserIds)
      : new Map<
          string,
          NonNullable<
            Awaited<ReturnType<ProfileService['getAttributionForUser']>>
          >
        >();

    const last = page.at(-1);
    return {
      items: page.map((row) => ({
        id: row.id,
        type: row.type,
        actor:
          row.actorUserId === null
            ? null
            : (attributions.get(row.actorUserId) ?? null),
        target: {
          type: row.targetType,
          id: row.targetId,
        },
        readAt: row.readAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor:
        rows.length > input.limit && last
          ? encodeNotificationCategoryCursor(
              ownerUserId,
              category,
              input.unreadOnly,
              { createdAt: last.createdAt, id: last.id },
            )
          : null,
    };
  }

  async unreadCounts(ownerUserId: string) {
    this.assertOwner(ownerUserId);
    const [socialUnreadCount, qaUnreadCount] = await Promise.all([
      this.notifications
        .countDocuments({
          userId: ownerUserId,
          type: { $in: [...CATEGORY_NOTIFICATION_TYPES.social] },
          readAt: null,
        })
        .exec(),
      this.notifications
        .countDocuments({
          userId: ownerUserId,
          type: { $in: [...CATEGORY_NOTIFICATION_TYPES.qa] },
          readAt: null,
        })
        .exec(),
    ]);
    if (
      !Number.isSafeInteger(socialUnreadCount) ||
      socialUnreadCount < 0 ||
      !Number.isSafeInteger(qaUnreadCount) ||
      qaUnreadCount < 0
    ) {
      return unavailable();
    }
    return { socialUnreadCount, qaUnreadCount };
  }

  private assertOwner(ownerUserId: string): void {
    if (!ownerUserId || !ownerUserId.trim()) {
      throw new UnprocessableEntityException({
        code: 'NOTIFICATION_CATEGORY_OWNER_REQUIRED',
        message: 'An authenticated account is required',
      });
    }
  }
}
