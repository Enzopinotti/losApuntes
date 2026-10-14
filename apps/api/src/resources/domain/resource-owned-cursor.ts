import { UnprocessableEntityException } from '@nestjs/common';

import type { ResourceVisibility } from './resource.types';

export type OwnedResourceCursor = { createdAt: Date; id: string };
export type OwnedResourceOrder = 'newest' | 'oldest';
export type OwnedResourceFilters = {
  visibility?: ResourceVisibility;
  q?: string;
  subjectId?: string;
  order?: OwnedResourceOrder;
};

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function invalid(): never {
  throw new UnprocessableEntityException({
    code: 'RESOURCE_OWNED_CURSOR_INVALID',
    message: 'Owned resources cursor is invalid for these filters',
  });
}

/**
 * Keeps the original v1 cursor for the original default listing and uses a
 * filter-bound v2 token otherwise. IDs in tokens are resource IDs, not users.
 */
export function encodeOwnedResourceCursor(
  cursor: OwnedResourceCursor,
  visibility?: ResourceVisibility,
  filters: Omit<OwnedResourceFilters, 'visibility'> = {},
): string {
  const query = filters.q ?? null;
  const subjectId = filters.subjectId ?? null;
  const order = filters.order ?? 'newest';
  const extended = query !== null || subjectId !== null || order !== 'newest';
  return Buffer.from(
    JSON.stringify(
      extended
        ? {
            v: 2,
            createdAt: cursor.createdAt.toISOString(),
            id: cursor.id,
            visibility: visibility ?? null,
            q: query,
            subjectId,
            order,
          }
        : {
            v: 1,
            createdAt: cursor.createdAt.toISOString(),
            id: cursor.id,
            visibility: visibility ?? null,
          },
    ),
    'utf8',
  ).toString('base64url');
}

export function decodeOwnedResourceCursor(
  value: string | undefined,
  visibility?: ResourceVisibility,
  filters: Omit<OwnedResourceFilters, 'visibility'> = {},
): OwnedResourceCursor | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return invalid();
    }
    const item = parsed as Record<string, unknown>;
    const order = filters.order ?? 'newest';
    const extended = !!filters.q || !!filters.subjectId || order !== 'newest';
    const validFields =
      Object.keys(item).length === (extended ? 7 : 4) &&
      item.v === (extended ? 2 : 1) &&
      item.visibility === (visibility ?? null) &&
      (!extended ||
        (item.q === (filters.q ?? null) &&
          item.subjectId === (filters.subjectId ?? null) &&
          item.order === order)) &&
      typeof item.createdAt === 'string' &&
      typeof item.id === 'string' &&
      UUID_V4.test(item.id);
    if (!validFields) return invalid();
    const createdAt = new Date(item.createdAt as string);
    if (
      !Number.isFinite(createdAt.getTime()) ||
      createdAt.toISOString() !== item.createdAt
    )
      return invalid();
    return { createdAt, id: item.id as string };
  } catch {
    return invalid();
  }
}
