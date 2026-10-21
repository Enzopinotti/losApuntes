import { UnprocessableEntityException } from '@nestjs/common';

import {
  decodeReceivedRepliesCursor,
  encodeReceivedRepliesCursor,
} from './received-replies-cursor';

const FIRST_ID = 'f3b56c81-0cf9-4342-93bc-4a79bbf174d2';
const FIRST_DATE = new Date('2026-10-19T14:31:04.123Z');

function encoded(fields: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(fields), 'utf8').toString('base64url');
}

describe('B164 received Q&A replies cursor', () => {
  it('round trips a canonical owner-bound cursor without exposing the owner ID', () => {
    const cursor = encodeReceivedRepliesCursor(
      { createdAt: FIRST_DATE, id: FIRST_ID },
      'session-owner',
    );
    expect(cursor).not.toContain('session-owner');
    expect(decodeReceivedRepliesCursor(cursor, 'session-owner')).toEqual({
      createdAt: FIRST_DATE,
      id: FIRST_ID,
    });
    expect(
      decodeReceivedRepliesCursor(undefined, 'session-owner'),
    ).toBeUndefined();
  });

  it('rejects a cursor generated for a different user', () => {
    const cursor = encodeReceivedRepliesCursor(
      { createdAt: FIRST_DATE, id: FIRST_ID },
      'owner-a',
    );
    expect(() => decodeReceivedRepliesCursor(cursor, 'owner-b')).toThrow(
      UnprocessableEntityException,
    );
  });

  it.each([
    null,
    '',
    [],
    ['a', 'b'],
    { cursor: 'hidden' },
    'not+url/safe',
    'a'.repeat(513),
    encoded({ v: 1, t: FIRST_DATE.toISOString(), id: FIRST_ID }),
    encoded({ v: 2, t: FIRST_DATE.toISOString(), id: FIRST_ID, owner: 'test' }),
    encoded({ v: 1, t: 'not-date', id: FIRST_ID, owner: 'test' }),
    encoded({ v: 1, t: FIRST_DATE.toISOString(), id: 'bad', owner: 'test' }),
    encoded({
      v: 1,
      t: FIRST_DATE.toISOString(),
      id: FIRST_ID,
      owner: 'test',
      extra: 1,
    }),
    Buffer.from('{', 'utf8').toString('base64url'),
  ])('fails closed for malformed cursor values', (bad) => {
    expect(() => decodeReceivedRepliesCursor(bad, 'session-owner')).toThrow(
      UnprocessableEntityException,
    );
  });

  it('rejects noncanonical base64url even if it decodes to JSON', () => {
    const cursor = encodeReceivedRepliesCursor(
      { createdAt: FIRST_DATE, id: FIRST_ID },
      'owner',
    );
    expect(() => decodeReceivedRepliesCursor(cursor + '=', 'owner')).toThrow(
      UnprocessableEntityException,
    );
  });

  it('rejects valid-looking owner cursors with noncanonical date strings', () => {
    const good = encodeReceivedRepliesCursor(
      { createdAt: FIRST_DATE, id: FIRST_ID },
      'owner',
    );
    const fields = JSON.parse(
      Buffer.from(good, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    const bad = encoded({ ...fields, t: '2026-10-19T14:31:04Z' });
    expect(() => decodeReceivedRepliesCursor(bad, 'owner')).toThrow(
      UnprocessableEntityException,
    );
  });
});
