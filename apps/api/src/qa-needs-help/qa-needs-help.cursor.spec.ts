import { UnprocessableEntityException } from '@nestjs/common';

import {
  decodeNeedsHelpCursor,
  encodeNeedsHelpCursor,
} from './qa-needs-help.cursor';

const SUBJECT_ID = 'bbde8519-5796-429c-b078-7b705edc5a0b';
const OTHER_SUBJECT_ID = 'b14211d1-6f33-4e14-a946-6a9218e716c9';
const QUESTION_ID = '269f2da7-f70c-418d-9151-2b56a264977f';
const CREATED = new Date('2026-10-20T11:00:01.000Z');

function encodeRaw(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

describe('B166 unanswered-question cursor', () => {
  it('round trips an owner- and subject-bound keyset token', () => {
    const token = encodeNeedsHelpCursor(
      { createdAt: CREATED, questionId: QUESTION_ID },
      SUBJECT_ID,
      'viewer-one',
    );
    expect(token).not.toContain('viewer-one');
    expect(decodeNeedsHelpCursor(token, SUBJECT_ID, 'viewer-one')).toEqual({
      createdAt: CREATED,
      questionId: QUESTION_ID,
    });
    expect(
      decodeNeedsHelpCursor(undefined, SUBJECT_ID, 'viewer-one'),
    ).toBeUndefined();
  });

  it('rejects reuse across other student sessions and other subjects', () => {
    const token = encodeNeedsHelpCursor(
      { createdAt: CREATED, questionId: QUESTION_ID },
      SUBJECT_ID,
      'viewer-one',
    );
    expect(() =>
      decodeNeedsHelpCursor(token, SUBJECT_ID, 'viewer-two'),
    ).toThrow(UnprocessableEntityException);
    expect(() =>
      decodeNeedsHelpCursor(token, OTHER_SUBJECT_ID, 'viewer-one'),
    ).toThrow(UnprocessableEntityException);
  });

  it.each([
    '',
    null,
    3,
    [],
    ['token'],
    'bad+token',
    'a'.repeat(513),
    Buffer.from('{').toString('base64url'),
    encodeRaw({ v: 1, subjectId: SUBJECT_ID }),
    encodeRaw({
      v: 1,
      subjectId: SUBJECT_ID,
      viewer: 'forged',
      createdAt: CREATED.toISOString(),
      questionId: QUESTION_ID,
    }),
  ])('fails closed for invalid token %p', (bad) => {
    expect(() => decodeNeedsHelpCursor(bad, SUBJECT_ID, 'viewer-one')).toThrow(
      UnprocessableEntityException,
    );
  });

  it('rejects mutated canonical tokens, identifiers and dates', () => {
    const token = encodeNeedsHelpCursor(
      { createdAt: CREATED, questionId: QUESTION_ID },
      SUBJECT_ID,
      'viewer-one',
    );
    const fields = JSON.parse(
      Buffer.from(token, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;

    const corrupt = [
      { ...fields, questionId: 'not-uuid' },
      { ...fields, createdAt: '2026-10-20T11:00:01Z' },
      { ...fields, createdAt: 'invalid' },
      { ...fields, v: 2 },
      { ...fields, extra: true },
    ];
    for (const row of corrupt) {
      expect(() =>
        decodeNeedsHelpCursor(encodeRaw(row), SUBJECT_ID, 'viewer-one'),
      ).toThrow(UnprocessableEntityException);
    }
    expect(() =>
      decodeNeedsHelpCursor(token + '=', SUBJECT_ID, 'viewer-one'),
    ).toThrow(UnprocessableEntityException);
  });
});
