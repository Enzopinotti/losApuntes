import { UnprocessableEntityException } from '@nestjs/common';

import {
  assertNotificationCategory,
  decodeNotificationCategoryCursor,
  encodeNotificationCategoryCursor,
} from './notification-category.cursor';

const id = '11111111-1111-4111-8111-111111111111';
const createdAt = new Date('2026-10-20T12:00:00.000Z');

describe('B149 owner and category scoped pagination cursor', () => {
  it('round trips a strict canonical cursor without including internal account IDs', () => {
    const cursor = encodeNotificationCategoryCursor(
      'sensitive-user-id',
      'social',
      true,
      { id, createdAt },
    );
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(Buffer.from(cursor, 'base64url').toString('utf8')).not.toContain(
      'sensitive-user-id',
    );
    expect(
      decodeNotificationCategoryCursor(
        'sensitive-user-id',
        'social',
        true,
        cursor,
      ),
    ).toEqual({ id, createdAt });
    expect(
      decodeNotificationCategoryCursor('sensitive-user-id', 'social', true),
    ).toBeUndefined();
  });

  it('rejects cross-account, cross-category and cross-filter cursor reuse', () => {
    const token = encodeNotificationCategoryCursor('owner-a', 'social', true, {
      id,
      createdAt,
    });
    expect(() =>
      decodeNotificationCategoryCursor('owner-b', 'social', true, token),
    ).toThrow(UnprocessableEntityException);
    expect(() =>
      decodeNotificationCategoryCursor('owner-a', 'qa', true, token),
    ).toThrow(UnprocessableEntityException);
    expect(() =>
      decodeNotificationCategoryCursor('owner-a', 'social', false, token),
    ).toThrow(UnprocessableEntityException);
  });

  it('rejects malformed data, noncanonical tokens, invalid positions and unknown categories', () => {
    const token = encodeNotificationCategoryCursor('owner-a', 'social', true, {
      id,
      createdAt,
    });
    const object = JSON.parse(
      Buffer.from(token, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

    for (const value of [
      '',
      '!',
      'x'.repeat(513),
      token + '=',
      encode(null),
      encode([object]),
      encode({}),
      encode({ ...object, extra: true }),
      encode({ ...object, version: 2 }),
      encode({ ...object, createdAt: 'not-a-date' }),
      encode({ ...object, createdAt: '2026-10-20' }),
      encode({ ...object, id: 'bad-id' }),
      encode({ ...object, ownerScope: 'fake' }),
    ]) {
      expect(() =>
        decodeNotificationCategoryCursor('owner-a', 'social', true, value),
      ).toThrow(UnprocessableEntityException);
    }
    expect(() => assertNotificationCategory('system')).toThrow(
      UnprocessableEntityException,
    );
    expect(() => assertNotificationCategory('social')).not.toThrow();
    expect(() => assertNotificationCategory('qa')).not.toThrow();
  });
});
