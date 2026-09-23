import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { ProfileService } from '../../profile/domain/profile.service';
import type { NotificationCursor } from './notification.types';
import {
  NOTIFICATION_STORE,
  type NotificationStore,
} from './notification.store';

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

    if (
      typeof parsed.createdAt !== 'string' ||
      typeof parsed.id !== 'string'
    ) {
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
}
