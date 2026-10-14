import { ConflictException, UnprocessableEntityException } from '@nestjs/common';

export type ShareGrantPageCursor = {
  resourceId: string;
  resourceRevision: number;
  shareId: string;
};

const SHARE_ID_PATTERN = /^[0-9a-f]{24}$/u;

export function encodeShareGrantCursor(cursor: ShareGrantPageCursor): string {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      resourceId: cursor.resourceId,
      resourceRevision: cursor.resourceRevision,
      shareId: cursor.shareId,
    }),
    'utf8',
  ).toString('base64url');
}

/**
 * Never place internal user IDs into client-visible cursors. The stable
 * ObjectId of the share record is a pagination position, not a credential.
 */
export function decodeShareGrantCursor(
  cursor: string | undefined,
  resourceId: string,
  resourceRevision: number,
): ShareGrantPageCursor | undefined {
  if (!cursor) return undefined;

  try {
    const value = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;

    if (
      Object.keys(value).length !== 4 ||
      value.v !== 1 ||
      value.resourceId !== resourceId ||
      !Number.isInteger(value.resourceRevision) ||
      typeof value.shareId !== 'string' ||
      !SHARE_ID_PATTERN.test(value.shareId)
    ) {
      throw new Error('Invalid grants cursor');
    }
    if (value.resourceRevision !== resourceRevision) {
      throw new ConflictException({
        code: 'RESOURCE_SHARES_CURSOR_STALE',
        message: 'Resource revision changed; reload share grants',
      });
    }
    return {
      resourceId,
      resourceRevision,
      shareId: value.shareId,
    };
  } catch (error) {
    if (error instanceof ConflictException) throw error;
    throw new UnprocessableEntityException({
      code: 'RESOURCE_SHARES_CURSOR_INVALID',
      message: 'Share grants cursor is invalid',
    });
  }
}
