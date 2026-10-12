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

  it('round trips a search-and-subject cursor in oldest-first order', () => {
    const filters = {
      q: 'química avanzada',
      subjectId: '22222222-2222-4222-8222-222222222222',
      order: 'oldest' as const,
    };
    const token = encodeOwnedResourceCursor(cursor, 'shared', filters);
    expect(decodeOwnedResourceCursor(token, 'shared', filters)).toEqual(cursor);
    expect(JSON.parse(Buffer.from(token, 'base64url').toString('utf8')))
      .toEqual({
        v: 2,
        id: cursor.id,
        createdAt: cursor.createdAt.toISOString(),
        visibility: 'shared',
        q: filters.q,
        subjectId: filters.subjectId,
        order: 'oldest',
      });
  });

  it('rejects reusing pages with a different query, subject or order', () => {
    const filters = {
      q: 'cálculo',
      subjectId: '22222222-2222-4222-8222-222222222222',
      order: 'oldest' as const,
    };
    const token = encodeOwnedResourceCursor(cursor, 'private', filters);
    for (const altered of [
      { ...filters, q: 'física' },
      { ...filters, subjectId: '33333333-3333-4333-8333-333333333333' },
      { ...filters, order: 'newest' as const },
    ]) {
      expect(() => decodeOwnedResourceCursor(token, 'private', altered))
        .toThrow(UnprocessableEntityException);
    }
    expect(() => decodeOwnedResourceCursor(token, 'private'))
      .toThrow(UnprocessableEntityException);
  });

  it('keeps old default pagination tokens valid for existing clients', () => {
    const token = encodeOwnedResourceCursor(cursor, 'public');
    expect(decodeOwnedResourceCursor(token, 'public', { order: 'newest' }))
      .toEqual(cursor);
    expect(() => decodeOwnedResourceCursor(token, 'public', {
      q: 'álgebra',
    })).toThrow(UnprocessableEntityException);
  });

  it('rejects injection-shaped and extra-field v2 cursor payloads', () => {
    const good = encodeOwnedResourceCursor(cursor, undefined, { q: 'álgebra' });
    const payload = JSON.parse(Buffer.from(good, 'base64url').toString('utf8'));
    for (const malformed of [
      { ...payload, q: { $gt: '' } },
      { ...payload, subjectId: { $ne: null } },
      { ...payload, extra: 'untrusted' },
    ]) {
      const token = Buffer.from(JSON.stringify(malformed)).toString('base64url');
      expect(() => decodeOwnedResourceCursor(token, undefined, {
        q: 'álgebra',
      })).toThrow(UnprocessableEntityException);
    }
  });

});
