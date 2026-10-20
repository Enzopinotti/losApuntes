import { UnprocessableEntityException } from '@nestjs/common';
import { decodeMineCursor, encodeMineCursor } from './qa-mine-cursor';

const id = '22222222-2222-4222-8222-222222222222';
const updatedAt = new Date('2026-10-19T18:00:00.000Z');

describe('B145 owner-scoped question pagination cursor', () => {
  it('round trips the exact canonical cursor and does not expose an internal account ID', () => {
    const cursor = encodeMineCursor('sensitive-internal-id', { id, updatedAt });
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(Buffer.from(cursor, 'base64url').toString('utf8')).not.toContain(
      'sensitive-internal-id',
    );
    expect(decodeMineCursor('sensitive-internal-id', cursor)).toEqual({
      id,
      updatedAt,
    });
    expect(decodeMineCursor('sensitive-internal-id')).toBeUndefined();
  });

  it('rejects another account using the same cursor', () => {
    const cursor = encodeMineCursor('owner-a', { id, updatedAt });
    expect(() => decodeMineCursor('owner-b', cursor)).toThrow(
      UnprocessableEntityException,
    );
  });

  it('rejects tampering, extra fields, bad dates, invalid ids and noncanonical base64', () => {
    const encoded = (data: unknown): string =>
      Buffer.from(JSON.stringify(data), 'utf8').toString('base64url');
    const good = JSON.parse(
      Buffer.from(
        encodeMineCursor('owner-a', { id, updatedAt }),
        'base64url',
      ).toString('utf8'),
    ) as Record<string, unknown>;

    for (const cursor of [
      '',
      '=',
      '*'.repeat(4),
      'x'.repeat(513),
      encoded({ ...good, extra: 1 }),
      encoded({ ...good, version: 2 }),
      encoded({ ...good, updatedAt: 'not-a-date' }),
      encoded({ ...good, updatedAt: '2026-10-19' }),
      encoded({ ...good, id: 'not-a-uuid' }),
      encoded({ ...good, ownerTag: 'unknown' }),
      encoded([good]),
      encoded(null),
      encoded('hello'),
      encoded({}),
      encodeMineCursor('owner-a', { id, updatedAt }) + '=',
    ]) {
      expect(() => decodeMineCursor('owner-a', cursor)).toThrow(
        UnprocessableEntityException,
      );
    }
  });
});
