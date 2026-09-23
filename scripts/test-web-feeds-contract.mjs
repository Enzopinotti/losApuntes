import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

const service = await read(
  'apps/web/src/features/feeds/services/feedsService.ts',
);
assert.match(service, /credentials:\s*"include"/u);
assert.match(service, /cache:\s*"no-store"/u);
assert.match(service, /AbortSignal\.timeout\(15_000\)/u);
assert.doesNotMatch(service, /localStorage|sessionStorage/u);
assert.doesNotMatch(service, /Authorization\s*:/iu);
assert.doesNotMatch(service, /watchTime|watch_time|ctr|popularity/iu);

const page = await read('apps/web/src/pages/Feeds.tsx');
assert.match(page, /feedsApi\.academic/u);
assert.match(page, /feedsApi\.forYou/u);
assert.match(page, /feedsApi\.updatePreferences/u);
assert.match(page, /feedsApi\.setFeedback/u);
assert.match(page, /stopReason\s*===\s*"natural_break"/u);
assert.match(page, /Ver otra tanda/u);
assert.match(page, /Empezar una nueva sesión/u);
assert.doesNotMatch(page, /IntersectionObserver/u);
assert.doesNotMatch(page, /localStorage|sessionStorage/u);
assert.doesNotMatch(page, /setInterval|setTimeout/u);

const routes = await read('apps/web/src/app/routes.tsx');
assert.match(
  routes,
  /path:\s*"feeds"[\s\S]*?<PrivateRoute>[\s\S]*?<Feeds\s*\/>[\s\S]*?<\/PrivateRoute>/u,
);

console.log('PASS Web Feeds healthy-use and transport contract');
