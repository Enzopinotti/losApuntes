import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { ProfileService } from '../../profile/domain/profile.service';
import { assertNotificationFanoutBudget } from './notification-fanout';
import type {
  CreateNotificationRecord,
  NotificationAccountExportRow,
  NotificationCursor,
} from './notification.types';
import {
  NOTIFICATION_STORE,
  type NotificationStore,
} from './notification.store';

const NOTIFICATION_ACCOUNT_EXPORT_MAX_LIMIT = 100;

function assertAccountExportLimit(limit: number): void {
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > NOTIFICATION_ACCOUNT_EXPORT_MAX_LIMIT
  ) {
    throw new UnprocessableEntityException({
      code: 'NOTIFICATION_ACCOUNT_EXPORT_LIMIT_INVALID',
      message: 'Notification account export limit is invalid',
    });
  }
}

function encodeAccountExportCursor(cursor: NotificationCursor): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    }),
    'utf8',
  ).toString('base64url');
}

function decodeAccountExportCursor(
  value: string | null,
): NotificationCursor | undefined {
  if (value === null) return undefined;

  try {
    if (
      value.length === 0 ||
      value.length > 512 ||
      !/^[A-Za-z0-9_-]+$/u.test(value)
    ) {
      throw new Error('invalid cursor encoding');
    }

    const decoded = Buffer.from(value, 'base64url');
    if (decoded.toString('base64url') !== value) {
      throw new Error('noncanonical cursor encoding');
    }

    const parsed: unknown = JSON.parse(decoded.toString('utf8'));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error('invalid cursor payload');
    }

    const cursor = parsed as Record<string, unknown>;
    const keys = Object.keys(cursor);
    if (
      keys.length !== 2 ||
      !keys.includes('createdAt') ||
      !keys.includes('id') ||
      typeof cursor.createdAt !== 'string' ||
      typeof cursor.id !== 'string' ||
      cursor.id.length === 0 ||
      cursor.id.length > 128
    ) {
      throw new Error('invalid cursor fields');
    }

    const createdAt = new Date(cursor.createdAt);
    if (
      Number.isNaN(createdAt.getTime()) ||
      createdAt.toISOString() !== cursor.createdAt
    ) {
      throw new Error('invalid cursor timestamp');
    }

    return { createdAt, id: cursor.id };
  } catch {
    throw new UnprocessableEntityException({
      code: 'NOTIFICATION_ACCOUNT_EXPORT_CURSOR_INVALID',
      message: 'Notification account export cursor is invalid',
    });
  }
}

function encodeCursor(cursor: NotificationCursor): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    }),
    'utf8',
  ).toString('base64url');
}

function decodeCursor(value?: string): NotificationCursor | undefined {
  if (!value) return undefined;

  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;

    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') {
      throw new Error('invalid cursor');
    }

    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) throw new Error('invalid date');

    return { createdAt, id: parsed.id };
  } catch {
    throw new UnprocessableEntityException({
      code: 'NOTIFICATION_CURSOR_INVALID',
      message: 'Notification cursor is invalid',
    });
  }
}

@Injectable()
export class NotificationService {
  constructor(
    @Inject(NOTIFICATION_STORE)
    private readonly store: NotificationStore,
    private readonly profiles: ProfileService,
  ) {}

  async createMany(records: CreateNotificationRecord[]) {
    assertNotificationFanoutBudget(records);
    if (records.length === 0) return { created: 0 };

    return {
      created: await this.store.createMany(records),
    };
  }

  async list(
    userId: string,
    input: { unreadOnly: boolean; limit: number; cursor?: string },
  ) {
    const result = await this.store.list({
      userId,
      unreadOnly: input.unreadOnly,
      limit: input.limit,
      after: decodeCursor(input.cursor),
    });

    const items = await Promise.all(
      result.items.map(async (row) => ({
        id: row.id,
        type: row.type,
        actor: row.actorUserId
          ? await this.profiles.getAttributionForUser(row.actorUserId)
          : null,
        target: {
          type: row.targetType,
          id: row.targetId,
        },
        readAt: row.readAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
    );
    const last = result.items.at(-1);

    return {
      items,
      nextCursor:
        result.hasMore && last
          ? encodeCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  }

  async listAccountExportNotifications(
    userId: string,
    input: { limit: number; cursor: string | null },
  ): Promise<{
    items: Array<{
      id: string;
      type: NotificationAccountExportRow['type'];
      actorProfileId: string | null;
      targetType: NotificationAccountExportRow['targetType'];
      targetId: string;
      readAt: string | null;
      createdAt: string;
    }>;
    nextCursor: string | null;
  }> {
    assertAccountExportLimit(input.limit);
    const page = await this.store.listForAccountExport({
      userId,
      limit: input.limit,
      after: decodeAccountExportCursor(input.cursor),
    });
    const actorUserIds = page.items.flatMap((row) =>
      row.actorUserId === null ? [] : [row.actorUserId],
    );
    const profileIds =
      await this.profiles.getProfileIdsForAccountExport(actorUserIds);
    const items = page.items.map((row) => ({
      id: row.id,
      type: row.type,
      actorProfileId:
        row.actorUserId === null
          ? null
          : this.requireExportProfileId(profileIds, row.actorUserId),
      targetType: row.targetType,
      targetId: row.targetId,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
    const last = page.items.at(-1);

    return {
      items,
      nextCursor:
        page.hasMore && last
          ? encodeAccountExportCursor({
              createdAt: last.createdAt,
              id: last.id,
            })
          : null,
    };
  }

  async countUnread(userId: string) {
    return { unreadCount: await this.store.countUnread(userId) };
  }

  async markRead(userId: string, id: string) {
    const row = await this.store.markRead(userId, id, new Date());
    if (!row) {
      throw new NotFoundException({
        code: 'NOTIFICATION_NOT_FOUND',
        message: 'Notification was not found',
      });
    }

    return { read: true };
  }

  async markAllRead(userId: string) {
    const updated = await this.store.markAllRead(userId, new Date());
    return { updated };
  }

  private requireExportProfileId(
    profileIds: ReadonlyMap<string, string>,
    userId: string,
  ): string {
    const profileId = profileIds.get(userId);
    if (!profileId) {
      throw new NotFoundException({
        code: 'NOTIFICATION_ACTOR_PROFILE_NOT_FOUND',
        message: 'Notification actor Profile was not found',
      });
    }
    return profileId;
  }
}
