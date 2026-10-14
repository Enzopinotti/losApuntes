import { UnprocessableEntityException } from '@nestjs/common';

import {
  decodeSavedSearchCursor,
  encodeSavedSearchCursor,
} from './resource-saved-search-cursor';

const row = {
  createdAt: new Date('2026-10-14T11:15:12.123Z'),
  resourceId: '11111111-1111-4111-8111-111111111111',
};

describe('saved library search cursor', () => {
  it('roundtrips a cursor only for the same principal and normalized query', () => {
    const cursor = encodeSavedSearchCursor(row, 'owner-a', 'algebra');
    expect(decodeSavedSearchCursor(cursor, 'owner-a', 'algebra')).toEqual(row);
    expect(
      decodeSavedSearchCursor(undefined, 'owner-a', 'algebra'),
    ).toBeUndefined();

    for (const [owner, q] of [
      ['owner-b', 'algebra'],
      ['owner-a', 'fisica'],
      ['owner-b', 'fisica'],
    ]) {
      expect(() => decodeSavedSearchCursor(cursor, owner, q)).toThrow(
        UnprocessableEntityException,
      );
    }
  });

  it('does not accept a cursor from a different Subject', () => {
    const idA = '11111111-1111-4111-8111-111111111111';
    const idB = '22222222-2222-4222-8222-222222222222';
    const token = encodeSavedSearchCursor(row, 'owner-a', 'algebra', idA);
    expect(decodeSavedSearchCursor(token, 'owner-a', 'algebra', idA)).toEqual(
      row,
    );
    expect(() =>
      decodeSavedSearchCursor(token, 'owner-a', 'algebra', idB),
    ).toThrow(UnprocessableEntityException);
    expect(() => decodeSavedSearchCursor(token, 'owner-a', 'algebra')).toThrow(
      UnprocessableEntityException,
    );
  });

  it('rejects legacy cursors, extra fields, invalid dates and malicious identities', () => {
    const cursor = encodeSavedSearchCursor(row, 'owner-a', 'algebra');
    const valid = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

    for (const invalid of [
      'this-is-not-json',
      encode({
        createdAt: row.createdAt.toISOString(),
        resourceId: row.resourceId,
      }),
      encode({ ...valid, unexpected: 'field' }),
      encode({ ...valid, createdAt: 'not-a-date' }),
      encode({ ...valid, createdAt: '2026-10-14' }),
      encode({ ...valid, resourceId: '../admin' }),
      encode({ ...valid, version: 2 }),
      encode([]),
      encode(null),
    ]) {
      expect(() =>
        decodeSavedSearchCursor(invalid, 'owner-a', 'algebra'),
      ).toThrow(UnprocessableEntityException);
    }
  });
});
