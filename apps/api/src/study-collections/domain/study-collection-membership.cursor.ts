import { createHash } from 'node:crypto';

import { UnprocessableEntityException } from '@nestjs/common';

export interface MembershipPosition {
  updatedAt: Date;
  id: string;
}

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function invalid(): never {
  throw new UnprocessableEntityException({
    code: 'STUDY_COLLECTION_MEMBERSHIP_CURSOR_INVALID',
    message: 'Membership cursor is invalid',
  });
}

function ownerScope(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 32);
}

/**
 * Opaque continuation hint, never a credential. Each database query must
 * independently enforce the authenticated collection owner and resource.
 */
export function encodeMembershipCursor(
  ownerUserId: string,
  resourceId: string,
  position: MembershipPosition,
): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      ownerScope: ownerScope(ownerUserId),
      resourceId,
      updatedAt: position.updatedAt.toISOString(),
      id: position.id,
    }),
    'utf8',
  ).toString('base64url');
}

export function decodeMembershipCursor(
  ownerUserId: string,
  resourceId: string,
  cursor?: string,
): MembershipPosition | undefined {
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
        'id,ownerScope,resourceId,updatedAt,version' ||
      row.version !== 1 ||
      row.ownerScope !== ownerScope(ownerUserId) ||
      row.resourceId !== resourceId ||
      typeof row.updatedAt !== 'string' ||
      typeof row.id !== 'string' ||
      !UUID_V4.test(row.id)
    ) {
      return invalid();
    }
    const updatedAt = new Date(row.updatedAt);
    if (
      !Number.isFinite(updatedAt.getTime()) ||
      updatedAt.toISOString() !== row.updatedAt
    ) {
      return invalid();
    }
    return { updatedAt, id: row.id };
  } catch {
    return invalid();
  }
}
