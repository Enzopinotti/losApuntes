import { createHash } from 'node:crypto';
import { UnprocessableEntityException } from '@nestjs/common';

export interface SavedTitleCursor {
  title: string;
  resourceId: string;
}

function invalid(): never {
  throw new UnprocessableEntityException({
    code: 'RESOURCE_SAVED_SEARCH_CURSOR_INVALID',
    message: 'Saved resource cursor does not match the current sort or filters',
  });
}

function scopeHash(userId: string, query: string, subjectId?: string): string {
  return createHash('sha256')
    .update(
      JSON.stringify(['saved-title-v2', userId, query, subjectId ?? null]),
    )
    .digest('hex');
}

/**
 * Separate v2 cursor for collation-aware title ordering.
 * Old date cursors retain their exact v1 representation and contract.
 * A cursor is a page position, never an authorization decision.
 */
export function encodeSavedTitleCursor(
  after: SavedTitleCursor,
  userId: string,
  query: string,
  subjectId?: string,
): string {
  return Buffer.from(
    JSON.stringify({
      version: 2,
      order: 'title',
      title: after.title,
      resourceId: after.resourceId,
      scope: scopeHash(userId, query, subjectId),
    }),
    'utf8',
  ).toString('base64url');
}

export function decodeSavedTitleCursor(
  value: string | undefined,
  userId: string,
  query: string,
  subjectId?: string,
): SavedTitleCursor | undefined {
  if (!value) return undefined;
  try {
    // The DTO bounds the transport length. Protect direct service callers too.
    if (value.length > 2048 || value.length < 4) return invalid();
    const raw = Buffer.from(value, 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return invalid();
    const fields = parsed as Record<string, unknown>;
    if (
      Object.keys(fields).length !== 5 ||
      fields.version !== 2 ||
      fields.order !== 'title' ||
      typeof fields.title !== 'string' ||
      Array.from(fields.title).length < 1 ||
      Array.from(fields.title).length > 160 ||
      typeof fields.resourceId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        fields.resourceId,
      ) ||
      fields.scope !== scopeHash(userId, query, subjectId)
    )
      return invalid();
    return { title: fields.title, resourceId: fields.resourceId };
  } catch {
    return invalid();
  }
}
