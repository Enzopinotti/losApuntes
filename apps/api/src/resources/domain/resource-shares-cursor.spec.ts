import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import {
  decodeShareGrantCursor,
  encodeShareGrantCursor,
} from './resource-shares-cursor';

const resourceId = '11111111-1111-4111-8111-111111111111';
const shareId = '507f1f77bcf86cd799439011';

describe('resource shares cursor', () => {
  const token = () => encodeShareGrantCursor({
    resourceId,
    resourceRevision: 3,
    shareId,
  });

  it('round trips a resource-scoped share document position', () => {
    expect(decodeShareGrantCursor(undefined, resourceId, 3)).toBeUndefined();
    expect(decodeShareGrantCursor(token(), resourceId, 3)).toEqual({
      resourceId,
      resourceRevision: 3,
      shareId,
    });
  });

  it('never serializes recipient user IDs', () => {
    const value = Buffer.from(token(), 'base64url').toString('utf8');
    expect(JSON.parse(value)).toEqual({
      v: 1,
      resourceId,
      resourceRevision: 3,
      shareId,
    });
    expect(value).not.toContain('granteeUserId');
  });

  it('rejects cursors from another resource and from stale revisions', () => {
    expect(() => decodeShareGrantCursor(token(), 'another-resource', 3))
      .toThrow(UnprocessableEntityException);
    expect(() => decodeShareGrantCursor(token(), resourceId, 4))
      .toThrow(ConflictException);
  });

  it('rejects malformed and extra-field cursors', () => {
    const invalid = [
      'invalid',
      Buffer.from('{}').toString('base64url'),
      Buffer.from(JSON.stringify({
        v: 1,
        resourceId,
        resourceRevision: 3,
        shareId: 'invalid',
      })).toString('base64url'),
      Buffer.from(JSON.stringify({
        v: 1,
        resourceId,
        resourceRevision: 3,
        shareId,
        extra: true,
      })).toString('base64url'),
    ];
    for (const value of invalid) {
      expect(() => decodeShareGrantCursor(value, resourceId, 3))
        .toThrow(UnprocessableEntityException);
    }
  });
});
