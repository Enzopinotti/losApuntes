import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

const service = await read(
  'apps/web/src/features/search/services/searchService.ts',
);
assert.match(service, /credentials:\s*"include"/u);
assert.match(service, /cache:\s*"no-store"/u);
assert.match(service, /AbortSignal\.timeout\(15_000\)/u);
assert.doesNotMatch(service, /localStorage|sessionStorage/u);
assert.doesNotMatch(service, /Authorization\s*:/iu);
assert.doesNotMatch(service, /Bearer\s+/u);

const page = await read('apps/web/src/pages/Search.tsx');
assert.match(page, /searchApi\s*\.\s*search\s*\(/u);
assert.match(page, /searchApi\s*\.\s*contextual\s*\(/u);
assert.match(page, /status\s*===\s*"authenticated"/u);
assert.doesNotMatch(page, /localStorage|sessionStorage/u);
assert.doesNotMatch(page, /careerDiscoveryOptIn|recommendationSignals/u);

const routes = await read('apps/web/src/app/routes.tsx');
assert.match(
  routes,
  /\{\s*path:\s*"search",\s*element:\s*<Search\s*\/>\s*\}/u,
  'Global search must remain anonymous-readable',
);

console.log('PASS Web Search privacy/transport contract');
