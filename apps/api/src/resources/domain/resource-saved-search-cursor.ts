import { createHash } from 'node:crypto';
import { UnprocessableEntityException } from '@nestjs/common';

import type { SavedResourceCursor } from './resource.store';

function scopeHash(userId: string, q: string, subjectId?: string): string {
  return createHash('sha256')
    .update(JSON.stringify(subjectId ? [userId, q, subjectId] : [userId, q]))
    .digest('hex');
}

function invalidCursor(): never {
  throw new UnprocessableEntityException({
    code: 'RESOURCE_SAVED_SEARCH_CURSOR_INVALID',
    message:
      'Saved resource search cursor is invalid or does not match filters',
  });
}

/**
 * Search cursors are scoped to the current authenticated principal and the
 * normalized metadata query. This fingerprint is not an authorization token:
 * every result is still checked against current resource visibility.
 */
export function encodeSavedSearchCursor(
  cursor: SavedResourceCursor,
  userId: string,
  q: string,
  subjectId?: string,
): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      createdAt: cursor.createdAt.toISOString(),
      resourceId: cursor.resourceId,
      scope: scopeHash(userId, q, subjectId),
    }),
    'utf8',
  ).toString('base64url');
}

export function decodeSavedSearchCursor(
  value: string | undefined,
  userId: string,
  q: string,
  subjectId?: string,
): SavedResourceCursor | undefined {
  if (!value) return undefined;

  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return invalidCursor();

    const fields = parsed as Record<string, unknown>;
    if (
      Object.keys(fields).length !== 4 ||
      fields.version !== 1 ||
      typeof fields.createdAt !== 'string' ||
      typeof fields.resourceId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        fields.resourceId,
      ) ||
      fields.scope !== scopeHash(userId, q, subjectId)
    )
      return invalidCursor();

    const createdAt = new Date(fields.createdAt);
    if (
      Number.isNaN(createdAt.getTime()) ||
      createdAt.toISOString() !== fields.createdAt
    )
      return invalidCursor();

    return { createdAt, resourceId: fields.resourceId };
  } catch {
    return invalidCursor();
  }
}
