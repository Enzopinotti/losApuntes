import { UnprocessableEntityException } from '@nestjs/common';

import {
  decodeMyAnswersCursor,
  encodeMyAnswersCursor,
} from './qa-my-answers.cursor';

const id = '11111111-1111-4111-8111-111111111111';
const date = new Date('2026-10-19T20:00:00.000Z');

describe('B146 owner-bound answer pagination cursor', () => {
  it('round trips canonical base64url and excludes the internal account ID', () => {
    const encoded = encodeMyAnswersCursor('private-user-id', {
      id,
      createdAt: date,
    });
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(Buffer.from(encoded, 'base64url').toString('utf8')).not.toContain(
      'private-user-id',
    );
    expect(decodeMyAnswersCursor('private-user-id', encoded)).toEqual({
      id,
      createdAt: date,
    });
    expect(decodeMyAnswersCursor('private-user-id')).toBeUndefined();
  });

  it('rejects another authenticated account using the same cursor', () => {
    const cursor = encodeMyAnswersCursor('owner-a', {
      id,
      createdAt: date,
    });
    expect(() => decodeMyAnswersCursor('owner-b', cursor)).toThrow(
      UnprocessableEntityException,
    );
  });

  it('rejects tampering, extra fields, invalid IDs or noncanonical encodings', () => {
    const base = JSON.parse(
      Buffer.from(
        encodeMyAnswersCursor('owner-a', { id, createdAt: date }),
        'base64url',
      ).toString('utf8'),
    ) as Record<string, unknown>;
    const encoded = (input: unknown): string =>
      Buffer.from(JSON.stringify(input), 'utf8').toString('base64url');

    for (const cursor of [
      '',
      '*',
      'x'.repeat(513),
      encoded({ ...base, extra: true }),
      encoded({ ...base, version: 2 }),
      encoded({ ...base, id: 'not-uuid' }),
      encoded({ ...base, createdAt: 'yesterday' }),
      encoded({ ...base, createdAt: '2026-10-19' }),
      encoded({ ...base, ownerTag: 'other' }),
      encoded(null),
      encoded([base]),
      encoded({}),
      encodeMyAnswersCursor('owner-a', { id, createdAt: date }) + '=',
    ]) {
      expect(() => decodeMyAnswersCursor('owner-a', cursor)).toThrow(
        UnprocessableEntityException,
      );
    }
  });
});
