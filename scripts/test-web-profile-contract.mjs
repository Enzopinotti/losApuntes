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
assert.match(service, /function requestSignal\(signal\?: AbortSignal \| null\)/u);
assert.match(service, /AbortSignal\.any\(\[signal, timeout\]\)/u);
assert.match(service, /signal: requestSignal\(init\.signal\)/u);
assert.match(service, /me: \(signal\?: AbortSignal\)/u);
assert.match(service, /publicProfile: \(profileId: string, signal\?: AbortSignal\)/u);
assert.match(service, /publicActivities:[\s\S]*signal\?: AbortSignal/u);
assert.match(service, /profile\/me\/activities\?limit=/u);
assert.match(service, /profiles\/\$\{encodeURIComponent\(profileId\)\}\/activities/u);
assert.doesNotMatch(service, /localStorage|sessionStorage/u);
assert.doesNotMatch(service, /Authorization\s*:/iu);
assert.doesNotMatch(service, /Bearer\s+/u);

const owner = await read('apps/web/src/pages/Profile.tsx');
assert.match(owner, /profileApi\.me\(ticket\.signal\)/u);
assert.match(owner, /useAuth\(\)/u);
assert.match(owner, /user\?\.id/u);
assert.match(owner, /session\?\.id/u);
assert.equal((owner.match(/useAsyncAuthorityFence\(/gu) ?? []).length, 2);
assert.match(owner, /profile-owner-load:\$\{authScopeKey\}/u);
assert.match(owner, /profile-owner-action:\$\{authScopeKey\}/u);
assert.match(owner, /snapshotState\?\.scopeKey === authScopeKey/u);
assert.match(owner, /await loadRef\.current\(\)/u);
assert.match(owner, /ticket\.signal/u);
assert.match(owner, /profileApi\.update\(/u);
assert.match(owner, /profileApi\.createActivity\(/u);
assert.match(owner, /profileApi\.activities\(/u);
assert.match(owner, /activitiesNextCursor/u);
assert.match(owner, /appendActivities/u);
assert.doesNotMatch(owner, /localStorage|sessionStorage/u);
assert.doesNotMatch(owner, /career_id|cohort_year/u);

const publicPage = await read('apps/web/src/pages/PublicProfile.tsx');
assert.match(publicPage, /profileApi\s*\.\s*publicProfile\s*\(/u);
assert.match(publicPage, /useAuth\(\)/u);
assert.match(publicPage, /user\?\.id/u);
assert.match(publicPage, /session\?\.id/u);
assert.equal((publicPage.match(/useAsyncAuthorityFence\(/gu) ?? []).length, 2);
assert.match(publicPage, /public-profile-load:\$\{profileScopeKey\}/u);
assert.match(publicPage, /public-profile-pagination:\$\{profileScopeKey\}/u);
assert.match(
  publicPage,
  /profileApi\s*\.\s*publicProfile\s*\(\s*profileId,\s*ticket\.signal\s*\)/u,
);
assert.match(publicPage, /ticket\.signal/u);
assert.match(publicPage, /snapshotState\?\.scopeKey === profileScopeKey/u);
assert.doesNotMatch(publicPage, /let\s+active\s*=\s*true/u);
assert.match(publicPage, /profileApi\.publicActivities\(/u);
assert.match(publicPage, /activitiesNextCursor/u);
assert.match(publicPage, /appendActivities/u);
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
