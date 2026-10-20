import { createHash } from 'node:crypto';
import { UnprocessableEntityException } from '@nestjs/common';
import type { QuestionCursor } from './qa.types';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function invalidCursor(): never {
  throw new UnprocessableEntityException({
    code: 'QUESTION_MINE_CURSOR_INVALID',
    message: 'My questions cursor is invalid',
  });
}

function ownerTag(ownerUserId: string): string {
  return createHash('sha256').update(ownerUserId).digest('hex').slice(0, 32);
}

/**
 * Cursor is a pagination hint, never a proof of identity. Store queries must
 * still filter by the authenticated owner. Avoid exposing internal user IDs.
 */
export function encodeMineCursor(
  ownerUserId: string,
  cursor: QuestionCursor,
): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      ownerTag: ownerTag(ownerUserId),
      updatedAt: cursor.updatedAt.toISOString(),
      id: cursor.id,
    }),
    'utf8',
  ).toString('base64url');
}

export function decodeMineCursor(
  ownerUserId: string,
  value?: string,
): QuestionCursor | undefined {
  if (value === undefined) return undefined;
  if (
    value.length < 4 ||
    value.length > 512 ||
    !/^[A-Za-z0-9_-]+$/u.test(value)
  ) {
    return invalidCursor();
  }

  try {
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.length > 256 || bytes.toString('base64url') !== value) {
      return invalidCursor();
    }
    const parsed: unknown = JSON.parse(bytes.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return invalidCursor();
    }
    const row = parsed as Record<string, unknown>;
    if (
      Object.keys(row).sort().join(',') !==
        'id,ownerTag,updatedAt,version' ||
      row.version !== 1 ||
      row.ownerTag !== ownerTag(ownerUserId) ||
      typeof row.id !== 'string' ||
      !UUID_V4.test(row.id) ||
      typeof row.updatedAt !== 'string'
    ) {
      return invalidCursor();
    }
    const updatedAt = new Date(row.updatedAt);
    if (
      !Number.isFinite(updatedAt.getTime()) ||
      updatedAt.toISOString() !== row.updatedAt
    ) {
      return invalidCursor();
    }
    return { updatedAt, id: row.id };
  } catch {
    return invalidCursor();
  }
}
