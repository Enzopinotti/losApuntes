import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

const service = await read(
  'apps/web/src/features/profile/services/profileService.ts',
);
assert.match(service, /credentials:\s*"include"/u);
assert.match(service, /cache:\s*"no-store"/u);
assert.match(service, /AbortSignal\.timeout\(15_000\)/u);
assert.doesNotMatch(service, /localStorage|sessionStorage/u);
assert.doesNotMatch(service, /Authorization\s*:/iu);
assert.doesNotMatch(service, /Bearer\s+/u);

const owner = await read('apps/web/src/pages/Profile.tsx');
assert.match(owner, /profileApi\.me\(\)/u);
assert.match(owner, /profileApi\.update\(/u);
assert.match(owner, /profileApi\.createActivity\(/u);
assert.doesNotMatch(owner, /localStorage|sessionStorage/u);
assert.doesNotMatch(owner, /career_id|cohort_year/u);

const publicPage = await read('apps/web/src/pages/PublicProfile.tsx');
assert.match(publicPage, /profileApi\s*\.\s*publicProfile\s*\(/u);
assert.doesNotMatch(publicPage, /profileApi\.me\(\)/u);
assert.doesNotMatch(publicPage, /careerDiscoveryOptIn|recommendationSignals/u);
assert.doesNotMatch(publicPage, /localStorage|sessionStorage/u);

const routes = await read('apps/web/src/app/routes.tsx');
assert.match(routes, /path:\s*"profile"/u);
assert.match(routes, /path:\s*"p\/:profileId"/u);
assert.match(
  routes,
  /path:\s*"profile"[\s\S]*?<PrivateRoute>[\s\S]*?<Profile\s*\/>[\s\S]*?<\/PrivateRoute>/u,
);
assert.match(
  routes,
  /\{\s*path:\s*"p\/:profileId",\s*element:\s*<PublicProfile\s*\/>\s*\}/u,
  'Public profile route must remain anonymous-readable',
);

console.log('PASS Web Profile privacy/transport contract');
