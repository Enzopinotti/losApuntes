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
assert.match(service, /function requestSignal\(signal\?: AbortSignal \| null\)/u);
assert.match(service, /AbortSignal\.any\(\[signal, timeout\]\)/u);
assert.match(service, /signal: requestSignal\(init\.signal\)/u);
assert.match(service, /home: \(signal\?: AbortSignal\)/u);
assert.match(service, /metrics: \(days = 14, signal\?: AbortSignal\)/u);
assert.match(service, /moderation:[\s\S]*signal\?: AbortSignal/u);
assert.match(service, /review:[\s\S]*signal\?: AbortSignal/u);
assert.doesNotMatch(service, /localStorage|sessionStorage/u);
assert.doesNotMatch(service, /Authorization\s*:/iu);
assert.doesNotMatch(service, /Bearer\s+/u);

const home = await read('apps/web/src/pages/Home.tsx');
assert.match(home, /status\s*===\s*"authenticated"/u);
assert.match(home, /useAuth\(\)/u);
assert.match(home, /user\?\.id/u);
assert.match(home, /session\?\.id/u);
assert.equal((home.match(/useAsyncAuthorityFence\(/gu) ?? []).length, 1);
assert.match(home, /pilot-home:\$\{authScopeKey\}/u);
assert.match(home, /pilotApi\.home\(ticket\.signal\)/u);
assert.match(home, /snapshotState\?\.scopeKey === authScopeKey/u);
assert.match(home, /if \(!isLoadCurrent\(ticket\)\) return/u);
assert.match(home, /status\s*!==\s*"authenticated"/u);
assert.match(home, /return\s*<Landing\s*\/>/u);
assert.doesNotMatch(home, /Unishare/u);
assert.doesNotMatch(home, /localStorage|sessionStorage/u);

const admin = await read('apps/web/src/pages/AdminPilot.tsx');
assert.match(admin, /pilotApi\.metrics\(/u);
assert.match(admin, /pilotApi\.moderation\(/u);
assert.match(admin, /useAuth\(\)/u);
assert.match(admin, /user\?\.id/u);
assert.match(admin, /session\?\.id/u);
assert.equal((admin.match(/useAsyncAuthorityFence\(/gu) ?? []).length, 2);
assert.match(admin, /pilot-admin-load:\$\{loadScopeKey\}/u);
assert.match(admin, /pilot-admin-action:\$\{authScopeKey\}/u);
assert.match(admin, /pilotApi\.metrics\(days, ticket\.signal\)/u);
assert.match(
  admin,
  /pilotApi\.moderation\("pending", 50, ticket\.signal\)/u,
);
assert.match(admin, /ticket\.signal/u);
assert.match(admin, /await loadRef\.current\(\)/u);
assert.match(admin, /snapshotState\?\.scopeKey === loadScopeKey/u);
assert.match(admin, /setReason\(\{\}\)/u);
assert.match(admin, /subjectsTruncated/u);
assert.match(admin, /100 materias/u);
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
