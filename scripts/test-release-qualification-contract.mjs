import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  createWebReleaseManifest,
  qualifyWebRelease,
} from '../apps/web/release-manifest.ts';

const root = process.cwd();
const SOURCE_SHA = '66688287112fef162e31c0fe3acb46a3c6c669d2';
const OTHER_SHA = '1111111111111111111111111111111111111111';

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

assert.deepEqual(createWebReleaseManifest({}), {
  status: 'unavailable',
  service: 'web',
});

const webRelease = createWebReleaseManifest({
  releaseId: 'web-2026.10.04-1',
  sourceSha: SOURCE_SHA.toUpperCase(),
  apiOrigin: 'https://api.example.test',
});

assert.deepEqual(webRelease, {
  status: 'available',
  service: 'web',
  releaseId: 'web-2026.10.04-1',
  sourceSha: SOURCE_SHA,
  apiOrigin: 'https://api.example.test',
});

for (const apiOrigin of [
  'https://user:pass@api.example.test',
  'https://api.example.test/v1',
  'https://api.example.test?token=secret',
  'https://api.example.test#fragment',
  'file:///tmp/api.sock',
]) {
  assert.deepEqual(
    createWebReleaseManifest({
      releaseId: 'web-1',
      sourceSha: SOURCE_SHA,
      apiOrigin,
    }),
    { status: 'unavailable', service: 'web' },
  );
}

assert.deepEqual(
  qualifyWebRelease(webRelease, {
    status: 'available',
    service: 'api',
    releaseId: 'api-2026.10.04-1',
    sourceSha: SOURCE_SHA,
    apiOrigin: 'https://api.example.test',
  }).blockers,
  [],
);

assert.deepEqual(
  qualifyWebRelease(
    createWebReleaseManifest({
      releaseId: 'web-local',
      sourceSha: SOURCE_SHA,
      apiOrigin: 'http://127.0.0.1:4000',
    }),
    {
      status: 'available',
      service: 'api',
      releaseId: 'api-local',
      sourceSha: SOURCE_SHA,
      apiOrigin: 'http://127.0.0.1:4000',
    },
  ).blockers,
  ['INSECURE_API_ORIGIN'],
);

assert.deepEqual(
  qualifyWebRelease(webRelease, {
    status: 'available',
    service: 'api',
    releaseId: 'api-other',
    sourceSha: SOURCE_SHA,
    apiOrigin: 'https://staging-api.example.test',
  }).blockers,
  ['API_ORIGIN_MISMATCH'],
);

assert.deepEqual(
  qualifyWebRelease(webRelease, {
    status: 'available',
    service: 'api',
    releaseId: 'api-other-sha',
    sourceSha: OTHER_SHA,
    apiOrigin: 'https://api.example.test',
  }).blockers,
  ['SOURCE_SHA_MISMATCH'],
);

assert.deepEqual(
  qualifyWebRelease(webRelease, {
    status: 'unavailable',
    service: 'api',
    apiOrigin: 'https://api.example.test',
  }).blockers,
  ['API_RELEASE_UNAVAILABLE'],
);

const vite = await read('apps/web/vite.config.ts');
assert.match(vite, /fileName:\s*"release\.json"/u);
assert.match(vite, /createWebReleaseManifest/u);
assert.match(vite, /VITE_RELEASE_ID/u);
assert.match(vite, /VITE_RELEASE_SHA/u);
assert.match(vite, /VITE_API_BASE_URL/u);

const webPackage = JSON.parse(await read('apps/web/package.json'));
assert.match(webPackage.scripts.build, /check-web-release-build\.mjs/u);

const mobile = await read(
  'apps/mobile/src/config/release-qualification.ts',
);
assert.match(mobile, /SERVER_SOURCE_SHA_MISMATCH/u);
assert.match(
  mobile,
  /serverRelease\.sourceSha\s*!==\s*identity\.sourceSha/u,
);

console.log('PASS Web/Mobile release qualification identity contract');
