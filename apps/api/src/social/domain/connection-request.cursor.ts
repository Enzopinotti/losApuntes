import { createHash } from 'node:crypto';

import { UnprocessableEntityException } from '@nestjs/common';

import type { SocialCursor } from './social.types';

export const CONNECTION_REQUEST_DIRECTIONS = ['incoming', 'outgoing'] as const;
export type ConnectionRequestDirection =
  (typeof CONNECTION_REQUEST_DIRECTIONS)[number];

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function invalid(): never {
  throw new UnprocessableEntityException({
    code: 'SOCIAL_REQUEST_CURSOR_INVALID',
    message: 'Connection request cursor is invalid',
  });
}

function ownerScope(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 32);
}

/** Position hint, not an authorization grant. Mongo must still check both participants. */
export function encodeConnectionRequestCursor(
  userId: string,
  direction: ConnectionRequestDirection,
  position: SocialCursor,
): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      ownerScope: ownerScope(userId),
      direction,
      at: position.at.toISOString(),
      id: position.id,
    }),
    'utf8',
  ).toString('base64url');
}

export function decodeConnectionRequestCursor(
  userId: string,
  direction: ConnectionRequestDirection,
  cursor?: string,
): SocialCursor | undefined {
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
    const payload: unknown = JSON.parse(bytes.toString('utf8'));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return invalid();
    }
    const row = payload as Record<string, unknown>;
    if (
      Object.keys(row).sort().join(',') !==
        'at,direction,id,ownerScope,version' ||
      row.version !== 1 ||
      row.ownerScope !== ownerScope(userId) ||
      row.direction !== direction ||
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
