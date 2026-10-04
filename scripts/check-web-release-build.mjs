import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const manifestPath = path.join(process.cwd(), 'dist', 'release.json');
const raw = await readFile(manifestPath, 'utf8');
const manifest = JSON.parse(raw);

assert.equal(
  typeof manifest === 'object' && manifest !== null && !Array.isArray(manifest),
  true,
  'release.json must contain one JSON object',
);
assert.equal(manifest.service, 'web');

if (manifest.status === 'unavailable') {
  assert.deepEqual(Object.keys(manifest).sort(), ['service', 'status']);
} else {
  assert.equal(manifest.status, 'available');
  assert.deepEqual(Object.keys(manifest).sort(), [
    'apiOrigin',
    'releaseId',
    'service',
    'sourceSha',
    'status',
  ]);
  assert.match(manifest.releaseId, /^[A-Za-z0-9._:-]{1,128}$/u);
  assert.match(manifest.sourceSha, /^[a-f\d]{40}$/u);

  const apiOrigin = new URL(manifest.apiOrigin);
  assert.equal(['http:', 'https:'].includes(apiOrigin.protocol), true);
  assert.equal(apiOrigin.username, '');
  assert.equal(apiOrigin.password, '');
  assert.equal(apiOrigin.pathname, '/');
  assert.equal(apiOrigin.search, '');
  assert.equal(apiOrigin.hash, '');
}

console.log(
  `PASS Web release build manifest (${manifest.status}) at ${manifestPath}`,
);
