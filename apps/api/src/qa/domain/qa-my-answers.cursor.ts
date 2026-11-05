import { createHash } from 'node:crypto';

import { UnprocessableEntityException } from '@nestjs/common';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface MyAnswersCursorPosition {
  createdAt: Date;
  id: string;
}

function invalidCursor(): never {
  throw new UnprocessableEntityException({
    code: 'QA_MY_ANSWERS_CURSOR_INVALID',
    message: 'My answers cursor is invalid',
  });
}

function ownerTag(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 32);
}

/**
 * Opaque continuation hint, not an access credential. Mongo still applies the
 * authenticated account ID at the beginning of every aggregation.
 */
export function encodeMyAnswersCursor(
  userId: string,
  position: MyAnswersCursorPosition,
): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      ownerTag: ownerTag(userId),
      createdAt: position.createdAt.toISOString(),
      id: position.id,
    }),
    'utf8',
  ).toString('base64url');
}

export function decodeMyAnswersCursor(
  userId: string,
  cursor?: string,
): MyAnswersCursorPosition | undefined {
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
      Object.keys(row).sort().join(',') !== 'createdAt,id,ownerTag,version' ||
      row.version !== 1 ||
      row.ownerTag !== ownerTag(userId) ||
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
