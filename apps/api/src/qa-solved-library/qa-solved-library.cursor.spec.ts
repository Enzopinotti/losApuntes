import { UnprocessableEntityException } from '@nestjs/common';

import {
  decodeSolvedQaCursor,
  encodeSolvedQaCursor,
} from './qa-solved-library.cursor';

const SUBJECT = 'bbde8519-5796-429c-b078-7b705edc5a0b';
const OTHER_SUBJECT = 'b14211d1-6f33-4e14-a946-6a9218e716c9';
const QUESTION = '269f2da7-f70c-418d-9151-2b56a264977f';
const DATE = new Date('2026-10-21T11:30:45.000Z');

function encodeRaw(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

describe('B169 solved Q&A library cursor', () => {
  it('round-trips a canonical cursor for the subject and viewer', () => {
    const token = encodeSolvedQaCursor(
      { createdAt: DATE, questionId: QUESTION },
      SUBJECT,
      'session-owner',
    );
    expect(token).not.toContain('session-owner');
    expect(decodeSolvedQaCursor(token, SUBJECT, 'session-owner')).toEqual({
      createdAt: DATE,
      questionId: QUESTION,
    });
    expect(
      decodeSolvedQaCursor(undefined, SUBJECT, 'session-owner'),
    ).toBeUndefined();
  });

  it('rejects a cursor reused on another account or subject', () => {
    const token = encodeSolvedQaCursor(
      { createdAt: DATE, questionId: QUESTION },
      SUBJECT,
      'owner-one',
    );
    expect(() => decodeSolvedQaCursor(token, SUBJECT, 'owner-two')).toThrow(
      UnprocessableEntityException,
    );
    expect(() =>
      decodeSolvedQaCursor(token, OTHER_SUBJECT, 'owner-one'),
    ).toThrow(UnprocessableEntityException);
  });

  it.each([
    { raw: null },
    { raw: '' },
    { raw: [] },
    { raw: ['abc'] },
    { raw: 'bad+base64' },
    { raw: 'a'.repeat(513) },
    { raw: Buffer.from('{').toString('base64url') },
    { raw: encodeRaw({ v: 1 }) },
  ])('rejects invalid raw cursor tokens', ({ raw }) => {
    expect(() => decodeSolvedQaCursor(raw, SUBJECT, 'viewer')).toThrow(
      UnprocessableEntityException,
    );
  });

  it('rejects mutated fields, noncanonical dates and encodings', () => {
    const token = encodeSolvedQaCursor(
      { createdAt: DATE, questionId: QUESTION },
      SUBJECT,
      'viewer',
    );
    const fields = JSON.parse(
      Buffer.from(token, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;

    for (const changed of [
      { ...fields, v: 2 },
      { ...fields, id: 'invalid' },
      { ...fields, at: '2026-10-21T11:30:45Z' },
      { ...fields, at: 'nonsense' },
      { ...fields, viewer: 'untrusted' },
      { ...fields, extra: true },
    ]) {
      expect(() =>
        decodeSolvedQaCursor(encodeRaw(changed), SUBJECT, 'viewer'),
      ).toThrow(UnprocessableEntityException);
    }

    expect(() => decodeSolvedQaCursor(token + '=', SUBJECT, 'viewer')).toThrow(
      UnprocessableEntityException,
    );
  });
});
