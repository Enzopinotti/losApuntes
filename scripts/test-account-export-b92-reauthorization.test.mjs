import assert from 'node:assert/strict';
import test from 'node:test';

import { reauthorizeAccountExportDownload } from '../apps/api/src/data-lifecycle/domain/account-export-download-reauthorization.ts';

const first = {
  kind: 'available',
  formatVersion: 3,
  generation: '11111111-1111-4111-8111-111111111111',
  byteLength: 412,
  sha256: 'a'.repeat(64),
};
const check = next => reauthorizeAccountExportDownload(first, next);

test('B92 unchanged owner-authorized artifact remains downloadable', () => {
  assert.equal(check({ ...first }), 'unchanged');
});

test('B92 expiry during full S3 preflight revokes download', () => {
  assert.equal(check({ kind: 'expired' }), 'expired');
});

test('B92 owner export disappearance during GET fails closed as not found', () => {
  assert.equal(check({ kind: 'not_found' }), 'not_found');
});

test('B92 a non-completed job after GET is not downloadable', () => {
  assert.equal(check({ kind: 'not_ready' }), 'not_ready');
});

test('B92 a changed generation is rejected before emitting headers', () => {
  assert.equal(check({ ...first, generation: 'other-generation' }), 'changed');
});

test('B92 changed byte length and SHA-256 cannot reuse the original preflight', () => {
  assert.equal(check({ ...first, byteLength: first.byteLength - 1 }), 'changed');
  assert.equal(check({ ...first, sha256: 'b'.repeat(64) }), 'changed');
});

test('B92 version changes cannot reuse verified bytes', () => {
  assert.equal(check({ ...first, formatVersion: 2 }), 'changed');
});

test('B92 helper never upgrades a nonavailable initial result', () => {
  for (const kind of ['expired', 'not_ready', 'not_found']) {
    assert.equal(reauthorizeAccountExportDownload({ kind }, first), 'changed');
  }
});

test('B92 does not mutate stored identity or metadata during comparison', () => {
  const original = { ...first };
  const after = { ...first };
  assert.equal(check(after), 'unchanged');
  assert.deepEqual(first, original);
  assert.deepEqual(after, original);
});
