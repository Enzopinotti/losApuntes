import { UnprocessableEntityException } from '@nestjs/common';

import { decodeFollowersCursor, encodeFollowersCursor } from './followers.cursor';

const id = '11111111-1111-4111-8111-111111111111';
const at = new Date('2026-10-20T14:00:00.000Z');

describe('B148 owner-bound follower cursor', () => {
  it('round trips a canonical position without serializing an account ID', () => {
    const cursor = encodeFollowersCursor('sensitive-account-id', { id, at });
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(Buffer.from(cursor, 'base64url').toString('utf8')).not.toContain(
      'sensitive-account-id',
    );
    expect(decodeFollowersCursor('sensitive-account-id', cursor)).toEqual({
      at,
      id,
    });
    expect(decodeFollowersCursor('sensitive-account-id')).toBeUndefined();
  });

  it('rejects a different authenticated account using the same continuation', () => {
    const cursor = encodeFollowersCursor('owner-a', { id, at });
    expect(() => decodeFollowersCursor('owner-b', cursor)).toThrow(
      UnprocessableEntityException,
    );
  });

  it('rejects malformed, altered, oversized and noncanonical cursors', () => {
    const original = encodeFollowersCursor('owner-a', { id, at });
    const base = JSON.parse(
      Buffer.from(original, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    const encode = (value: unknown): string =>
      Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
    for (const cursor of [
      '',
      '!',
      'x'.repeat(513),
      original + '=',
      encode({ ...base, extra: true }),
      encode({ ...base, version: 2 }),
      encode({ ...base, at: 'not-a-date' }),
      encode({ ...base, at: '2026-10-20' }),
      encode({ ...base, id: 'not-a-uuid' }),
      encode({ ...base, ownerScope: 'spoofed' }),
      encode({}),
      encode([base]),
      encode(null),
    ]) {
      expect(() => decodeFollowersCursor('owner-a', cursor)).toThrow(
        UnprocessableEntityException,
      );
    }
  });
});
