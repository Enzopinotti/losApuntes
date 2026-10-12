import { UnprocessableEntityException } from '@nestjs/common';

import type { ResourceVisibility } from './resource.types';

export type OwnedResourceCursor = {
  createdAt: Date;
  id: string;
};

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function encodeOwnedResourceCursor(
  cursor: OwnedResourceCursor,
  visibility?: ResourceVisibility,
): string {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
      visibility: visibility ?? null,
    }),
    'utf8',
  ).toString('base64url');
}

export function decodeOwnedResourceCursor(
  value: string | undefined,
  visibility?: ResourceVisibility,
): OwnedResourceCursor | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Object.keys(parsed).length !== 4 ||
      parsed.v !== 1 ||
      parsed.visibility !== (visibility ?? null) ||
      typeof parsed.createdAt !== 'string' ||
      typeof parsed.id !== 'string' ||
      !UUID_V4.test(parsed.id)
    ) throw new Error('Invalid owner library cursor');

    const createdAt = new Date(parsed.createdAt);
    if (
      !Number.isFinite(createdAt.getTime()) ||
      createdAt.toISOString() !== parsed.createdAt
    ) throw new Error('Invalid owner library cursor date');
    return { createdAt, id: parsed.id };
  } catch {
    throw new UnprocessableEntityException({
      code: 'RESOURCE_OWNED_CURSOR_INVALID',
      message: 'Owned resources cursor is invalid',
    });
  }
}
