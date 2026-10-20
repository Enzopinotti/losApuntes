import { UnprocessableEntityException } from '@nestjs/common';

import {
  decodeConnectionRequestCursor,
  encodeConnectionRequestCursor,
} from './connection-request.cursor';

const id = '11111111-1111-4111-8111-111111111111';
const at = new Date('2026-10-20T00:00:00.000Z');

describe('B147 private request inbox cursor', () => {
  it('uses owner+direction scope and never serializes the user ID', () => {
    const value = encodeConnectionRequestCursor('private-account', 'incoming', {
      id,
      at,
    });
    expect(decodeConnectionRequestCursor('private-account', 'incoming', value))
      .toEqual({ id, at });
    expect(Buffer.from(value, 'base64url').toString('utf8')).not.toContain(
      'private-account',
    );
    expect(decodeConnectionRequestCursor('private-account', 'incoming'))
      .toBeUndefined();
  });

  it('rejects moving a cursor between accounts or request directions', () => {
    const cursor = encodeConnectionRequestCursor('owner-a', 'incoming', {
      id,
      at,
    });
    expect(() => decodeConnectionRequestCursor('owner-b', 'incoming', cursor))
      .toThrow(UnprocessableEntityException);
    expect(() => decodeConnectionRequestCursor('owner-a', 'outgoing', cursor))
      .toThrow(UnprocessableEntityException);
  });

  it('rejects altered, noncanonical or unexpected cursor contents', () => {
    const base = JSON.parse(
      Buffer.from(
        encodeConnectionRequestCursor('owner-a', 'incoming', { id, at }),
        'base64url',
      ).toString('utf8'),
    ) as Record<string, unknown>;
    const encode = (x: unknown) =>
      Buffer.from(JSON.stringify(x), 'utf8').toString('base64url');
    for (const value of [
      '',
      '!',
      'x'.repeat(513),
      encode(null),
      encode([base]),
      encode({ ...base, extra: true }),
      encode({ ...base, version: 2 }),
      encode({ ...base, at: '2026-10-20' }),
      encode({ ...base, id: 'not-uuid' }),
      encode({ ...base, ownerScope: 'forged' }),
      encodeConnectionRequestCursor('owner-a', 'incoming', { id, at }) + '=',
    ]) {
      expect(() =>
        decodeConnectionRequestCursor('owner-a', 'incoming', value),
      ).toThrow(UnprocessableEntityException);
    }
  });
});
