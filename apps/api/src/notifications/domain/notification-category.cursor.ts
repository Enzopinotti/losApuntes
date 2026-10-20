import { createHash } from 'node:crypto';

import { UnprocessableEntityException } from '@nestjs/common';

import type { NotificationType, NotificationTargetType } from './notification.types';

export const NOTIFICATION_CATEGORIES = ['social', 'qa'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const CATEGORY_NOTIFICATION_TYPES: Record<
  NotificationCategory,
  readonly NotificationType[]
> = {
  social: [
    'social.followed',
    'social.connection_requested',
    'social.connection_accepted',
  ],
  qa: ['qa.question_answered', 'qa.answer_accepted'],
};

export const CATEGORY_TARGET_TYPES: Record<NotificationType, NotificationTargetType> = {
  'social.followed': 'profile',
  'social.connection_requested': 'connection',
  'social.connection_accepted': 'connection',
  'qa.question_answered': 'question',
  'qa.answer_accepted': 'answer',
};

export interface NotificationCategoryPosition {
  createdAt: Date;
  id: string;
}

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function assertNotificationCategory(
  category: string,
): asserts category is NotificationCategory {
  if (!NOTIFICATION_CATEGORIES.some((allowed) => allowed === category)) {
    throw new UnprocessableEntityException({
      code: 'NOTIFICATION_CATEGORY_INVALID',
      message: 'Notification category is invalid',
    });
  }
}

function invalidCursor(): never {
  throw new UnprocessableEntityException({
    code: 'NOTIFICATION_CATEGORY_CURSOR_INVALID',
    message: 'Notification category cursor is invalid',
  });
}

function ownerScope(ownerUserId: string): string {
  return createHash('sha256').update(ownerUserId).digest('hex').slice(0, 32);
}

/** Pagination hint, never authorization; Mongo always checks the current owner. */
export function encodeNotificationCategoryCursor(
  ownerUserId: string,
  category: NotificationCategory,
  unreadOnly: boolean,
  position: NotificationCategoryPosition,
): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      ownerScope: ownerScope(ownerUserId),
      category,
      unreadOnly,
      createdAt: position.createdAt.toISOString(),
      id: position.id,
    }),
    'utf8',
  ).toString('base64url');
}

export function decodeNotificationCategoryCursor(
  ownerUserId: string,
  category: NotificationCategory,
  unreadOnly: boolean,
  cursor?: string,
): NotificationCategoryPosition | undefined {
  if (cursor === undefined) return undefined;
  if (
    cursor.length < 4 ||
    cursor.length > 512 ||
    !/^[A-Za-z0-9_-]+$/u.test(cursor)
  ) {
    return invalidCursor();
  }

  try {
    const bytes = Buffer.from(cursor, 'base64url');
    if (bytes.length > 256 || bytes.toString('base64url') !== cursor) {
      return invalidCursor();
    }
    const value: unknown = JSON.parse(bytes.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return invalidCursor();
    }
    const row = value as Record<string, unknown>;
    if (
      Object.keys(row).sort().join(',') !==
        'category,createdAt,id,ownerScope,unreadOnly,version' ||
      row.version !== 1 ||
      row.ownerScope !== ownerScope(ownerUserId) ||
      row.category !== category ||
      row.unreadOnly !== unreadOnly ||
      typeof row.createdAt !== 'string' ||
      typeof row.id !== 'string' ||
      !UUID_V4.test(row.id)
    ) {
      return invalidCursor();
    }
    const createdAt = new Date(row.createdAt);
    if (
      !Number.isFinite(createdAt.getTime()) ||
      createdAt.toISOString() !== row.createdAt
    ) {
      return invalidCursor();
    }
    return { createdAt, id: row.id };
  } catch {
    return invalidCursor();
  }
}
