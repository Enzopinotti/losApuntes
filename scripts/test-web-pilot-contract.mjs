import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

const service = await read(
  'apps/web/src/features/pilot/services/pilotService.ts',
);
assert.match(service, /credentials:\s*"include"/u);
assert.match(service, /cache:\s*"no-store"/u);
assert.match(service, /AbortSignal\.timeout\(15_000\)/u);
assert.doesNotMatch(service, /localStorage|sessionStorage/u);
assert.doesNotMatch(service, /Authorization\s*:/iu);
assert.doesNotMatch(service, /Bearer\s+/u);

const home = await read('apps/web/src/pages/Home.tsx');
assert.match(home, /status\s*===\s*"authenticated"/u);
assert.match(home, /pilotApi\.home\(\)/u);
assert.match(home, /status\s*!==\s*"authenticated"/u);
assert.match(home, /return\s*<Landing\s*\/>/u);
assert.doesNotMatch(home, /Unishare/u);
assert.doesNotMatch(home, /localStorage|sessionStorage/u);

const admin = await read('apps/web/src/pages/AdminPilot.tsx');
assert.match(admin, /pilotApi\.metrics\(/u);
assert.match(admin, /pilotApi\.moderation\(/u);
assert.match(admin, /nextError\.status\s*===\s*403/u);
assert.doesNotMatch(admin, /pilot:ops:read|moderation:write/u);
assert.doesNotMatch(admin, /localStorage|sessionStorage/u);

const routes = await read('apps/web/src/app/routes.tsx');
assert.match(routes, /path:\s*"admin\/pilot"/u);
assert.match(
  routes,
  /path:\s*"admin\/pilot"[\s\S]*?<PrivateRoute>[\s\S]*?<AdminPilot\s*\/>[\s\S]*?<\/PrivateRoute>/u,
);

const telemetryTypes = await read(
  'apps/api/src/pilot/telemetry/pilot-event.types.ts',
);
for (const forbidden of [
  'query',
  'content',
  'email',
  'ipAddress',
  'userAgent',
  'signedUrl',
]) {
  assert.equal(
    telemetryTypes.includes(forbidden),
    false,
    `Pilot telemetry schema must not contain ${forbidden}`,
  );
}

console.log('PASS Web Pilot privacy/transport contract');
