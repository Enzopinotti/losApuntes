import assert from 'node:assert/strict';
import test from 'node:test';
import { organizationPublicPath } from '../apps/web/src/features/organizations/organization-public-share.mjs';

test('builds a same-origin route only from canonical UUIDv4 organization ids', () => {
  assert.equal(
    organizationPublicPath('123e4567-e89b-42d3-a456-426614174000'),
    '/organizations/123e4567-e89b-42d3-a456-426614174000',
  );
  assert.equal(
    organizationPublicPath('123E4567-E89B-42D3-A456-426614174000'),
    '/organizations/123e4567-e89b-42d3-a456-426614174000',
  );
});

test('rejects path injection and non-v4 or malformed identities', () => {
  for (const id of [
    '../login',
    'https://example.test/organizations/1',
    '123e4567-e89b-12d3-a456-426614174000',
    '123e4567-e89b-42d3-7456-426614174000',
    '123e4567-e89b-42d3-a456-426614174000?next=/login',
    '',
    null,
  ]) {
    assert.equal(organizationPublicPath(id), null);
  }
});
