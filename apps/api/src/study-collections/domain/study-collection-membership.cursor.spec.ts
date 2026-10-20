import { UnprocessableEntityException } from '@nestjs/common';

import {
  decodeMembershipCursor,
  encodeMembershipCursor,
} from './study-collection-membership.cursor';

const resourceId = '11111111-1111-4111-8111-111111111111';
const otherResourceId = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const updatedAt = new Date('2026-10-20T12:00:00.000Z');

describe('B151 collection membership scoped cursor', () => {
  it('round trips a canonical cursor without embedding an account ID', () => {
    const cursor = encodeMembershipCursor('sensitive-user-id', resourceId, {
      id,
      updatedAt,
    });
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(Buffer.from(cursor, 'base64url').toString('utf8')).not.toContain(
      'sensitive-user-id',
    );
    expect(decodeMembershipCursor('sensitive-user-id', resourceId, cursor))
      .toEqual({ id, updatedAt });
    expect(
      decodeMembershipCursor('sensitive-user-id', resourceId),
    ).toBeUndefined();
  });

  it('rejects foreign owner and different resource cursors', () => {
    const cursor = encodeMembershipCursor('owner-a', resourceId, {
      id,
      updatedAt,
    });
    expect(() =>
      decodeMembershipCursor('owner-b', resourceId, cursor),
    ).toThrow(UnprocessableEntityException);
    expect(() =>
      decodeMembershipCursor('owner-a', otherResourceId, cursor),
    ).toThrow(UnprocessableEntityException);
  });

  it('rejects malformed or tampered positions and noncanonical base64url', () => {
    const cursor = encodeMembershipCursor('owner-a', resourceId, {
      id,
      updatedAt,
    });
    const object = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

    for (const value of [
      '',
      '*',
      'x'.repeat(513),
      cursor + '=',
      encode(null),
      encode([]),
      encode({ ...object, extra: true }),
      encode({ ...object, version: 2 }),
      encode({ ...object, ownerScope: 'spoofed' }),
      encode({ ...object, updatedAt: '2026-10-20' }),
      encode({ ...object, updatedAt: 'invalid' }),
      encode({ ...object, id: 'not-a-uuid' }),
      encode({}),
    ]) {
      expect(() => decodeMembershipCursor('owner-a', resourceId, value))
        .toThrow(UnprocessableEntityException);
    }
  });
});
