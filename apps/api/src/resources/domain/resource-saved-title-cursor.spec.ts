import { UnprocessableEntityException } from '@nestjs/common';
import {
  decodeSavedTitleCursor,
  encodeSavedTitleCursor,
} from './resource-saved-title-cursor';

const row = {
  title: 'Álgebra II',
  resourceId: '11111111-1111-4111-8111-111111111111',
};

describe('saved global title cursor', () => {
  it('round-trips title and canonical resource ID under identical authority and filters', () => {
    const token = encodeSavedTitleCursor(row, 'user-a', 'resumen', '22222222-2222-4222-8222-222222222222');
    expect(decodeSavedTitleCursor(token, 'user-a', 'resumen', '22222222-2222-4222-8222-222222222222')).toEqual(row);
    expect(decodeSavedTitleCursor(undefined, 'user-a', 'resumen')).toBeUndefined();
  });

  it('fails closed on changed account, text, Subject, or implicit order', () => {
    const subject = '22222222-2222-4222-8222-222222222222';
    const token = encodeSavedTitleCursor(row, 'user-a', 'resumen', subject);
    for (const [userId, q, subjectId] of [
      ['user-b', 'resumen', subject],
      ['user-a', 'otro', subject],
      ['user-a', 'resumen', undefined],
      ['user-a', 'resumen', '33333333-3333-4333-8333-333333333333'],
    ] as Array<[string, string, string | undefined]>) {
      expect(() => decodeSavedTitleCursor(token, userId, q, subjectId))
        .toThrow(UnprocessableEntityException);
    }
  });

  it('rejects v1 saved-date cursors and malformed or extended payloads', () => {
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
    const current = JSON.parse(Buffer.from(
      encodeSavedTitleCursor(row, 'user-a', ''), 'base64url',
    ).toString('utf8')) as Record<string, unknown>;
    const invalid = [
      encode({ ...current, version: 1 }),
      encode({ ...current, order: 'saved' }),
      encode({ ...current, extra: true }),
      encode({ ...current, title: '' }),
      encode({ ...current, title: 'x'.repeat(221) }),
      encode({ ...current, resourceId: '../admin' }),
      encode([]),
      encode(null),
      'not-json',
      'x'.repeat(513),
    ];
    for (const token of invalid) {
      expect(() => decodeSavedTitleCursor(token, 'user-a', ''))
        .toThrow(UnprocessableEntityException);
    }
  });
});
