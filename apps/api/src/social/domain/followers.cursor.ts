import { createHash } from 'node:crypto';

import { UnprocessableEntityException } from '@nestjs/common';

export interface FollowersPosition {
  at: Date;
  id: string;
}

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function invalid(): never {
  throw new UnprocessableEntityException({
    code: 'SOCIAL_FOLLOWERS_CURSOR_INVALID',
    message: 'Followers cursor is invalid',
  });
}

function ownerScope(ownerUserId: string): string {
  return createHash('sha256').update(ownerUserId).digest('hex').slice(0, 32);
}

/**
 * A cursor identifies a position, not a permission. Every Mongo query must
 * remain scoped to the authenticated followee.
 */
export function encodeFollowersCursor(
  ownerUserId: string,
  position: FollowersPosition,
): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      ownerScope: ownerScope(ownerUserId),
      at: position.at.toISOString(),
      id: position.id,
    }),
    'utf8',
  ).toString('base64url');
}

export function decodeFollowersCursor(
  ownerUserId: string,
  cursor?: string,
): FollowersPosition | undefined {
  if (cursor === undefined) return undefined;
  if (
    cursor.length < 4 ||
    cursor.length > 512 ||
    !/^[A-Za-z0-9_-]+$/u.test(cursor)
  ) {
    return invalid();
  }

  try {
    const bytes = Buffer.from(cursor, 'base64url');
    if (bytes.length > 256 || bytes.toString('base64url') !== cursor) {
      return invalid();
    }
    const parsed: unknown = JSON.parse(bytes.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return invalid();
    }
    const row = parsed as Record<string, unknown>;
    if (
      Object.keys(row).sort().join(',') !== 'at,id,ownerScope,version' ||
      row.version !== 1 ||
      row.ownerScope !== ownerScope(ownerUserId) ||
      typeof row.at !== 'string' ||
      typeof row.id !== 'string' ||
      !UUID_V4.test(row.id)
    ) {
      return invalid();
    }
    const at = new Date(row.at);
    if (!Number.isFinite(at.getTime()) || at.toISOString() !== row.at) {
      return invalid();
    }
    return { at, id: row.id };
  } catch {
    return invalid();
  }
}
