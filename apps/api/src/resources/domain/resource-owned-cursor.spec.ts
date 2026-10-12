import { UnprocessableEntityException } from '@nestjs/common';

import {
  decodeOwnedResourceCursor,
  encodeOwnedResourceCursor,
} from './resource-owned-cursor';

const cursor = {
  id: '11111111-1111-4111-8111-111111111111',
  createdAt: new Date('2026-10-12T12:00:00.000Z'),
};

describe('owned resource listing cursor', () => {
  it('round trips stable creation time and UUID', () => {
    const token = encodeOwnedResourceCursor(cursor);
    expect(decodeOwnedResourceCursor(token)).toEqual(cursor);
    expect(decodeOwnedResourceCursor(undefined)).toBeUndefined();
  });

  it('binds a pagination token to the requested visibility filter', () => {
    const token = encodeOwnedResourceCursor(cursor, 'shared');
    expect(decodeOwnedResourceCursor(token, 'shared')).toEqual(cursor);
    expect(() => decodeOwnedResourceCursor(token, 'public')).toThrow(
      UnprocessableEntityException,
    );
    expect(() => decodeOwnedResourceCursor(token)).toThrow(
      UnprocessableEntityException,
    );
  });

  it('does not embed internal author identity or credentials', () => {
    const data = JSON.parse(
      Buffer.from(encodeOwnedResourceCursor(cursor, 'private'), 'base64url')
        .toString('utf8'),
    );
    expect(data).toEqual({
      v: 1,
      id: cursor.id,
      createdAt: '2026-10-12T12:00:00.000Z',
      visibility: 'private',
    });
    expect(data).not.toHaveProperty('authorUserId');
    expect(data).not.toHaveProperty('sessionId');
  });

  it('rejects malformed, overspecified, or invalid date cursors', () => {
    const make = (value: unknown) =>
      Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
    const base = {
      v: 1,
      id: cursor.id,
      createdAt: cursor.createdAt.toISOString(),
      visibility: null,
    };
    for (const token of [
      'not-valid',
      make({}),
      make({ ...base, id: 'fake-id' }),
      make({ ...base, createdAt: '2026-99-99T00:00:00.000Z' }),
      make({ ...base, visibility: 'other' }),
      make({ ...base, injected: true }),
    ]) {
      expect(() => decodeOwnedResourceCursor(token)).toThrow(
        UnprocessableEntityException,
      );
    }
  });
});
