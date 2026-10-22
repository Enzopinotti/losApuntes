import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const s3 = read('apps/api/src/files/storage/s3-object-storage.ts');
const jest = read('apps/api/src/files/storage/s3-object-storage.spec.ts');
const http = read('scripts/test-account-export-b86-s3-loopback.test.mjs');
const runner = read('scripts/run-account-export-b101-signed-http.mjs');
const verifier = read('scripts/testing/b87-s3-sigv4-verifier.mjs');
const tap = read('scripts/testing/b101-signed-http-tap.mjs');
const scripts = JSON.parse(read('package.json')).scripts;
const config = read('apps/api/src/config/runtime-environment.ts');
const ops = read('docs/operations/account-export-artifacts.md');

let count = 0;
function check(label, action) {
  action();
  count++;
  console.log('PASS ' + label);
}

const start = s3.indexOf('    createMultipartWriter(input: {', 1000);
const end = s3.indexOf('    createUploadIntent(', start);
const section = s3.slice(start, end);
const write = section.slice(section.indexOf('async write(chunk: Uint8Array)'),
  section.indexOf('async complete(): Promise<void>'));
const complete = section.slice(section.indexOf('async complete(): Promise<void>'),
  section.indexOf('async abort(): Promise<void>'));
const abort = section.slice(section.indexOf('async abort(): Promise<void>'));

check('B104 original S3 adapter uses irreversible writer failure flag', () => {
  assert.ok(start >= 0 && end > start);
  assert.match(section, /let failed = false/u);
  assert.match(write, /completed \|\| aborted \|\| failed/u);
  assert.match(write, /failed = true/u);
  assert.match(complete, /if \(failed\) \{/u);
  assert.match(complete, /S3 multipart writer cannot complete after a failed operation/u);
  assert.match(complete, /failed = true/u);
});
check('B104 failed part cannot be repaired by retrying completion', () => {
  assert.match(section, /pending\.length = 0/u);
  assert.match(section, /await uploadPart\(bytes\)/u);
  assert.match(write, /catch \(error\)/u);
  assert.match(complete, /catch \(error\)/u);
  assert.match(complete, /await flushPending\(\)/u);
  assert.match(complete, /completed = true/u);
});
check('B104 abort after write failure remains owner-fenced and uploadId-specific', () => {
  assert.doesNotMatch(abort, /if \(failed\) throw/u);
  assert.match(abort, /const currentUploadId = uploadId/u);
  assert.match(abort, /request\('DELETE', \[/u);
  assert.match(abort, /input\.deleteObjectOnAbort !== false/u);
});
check('B104 signed HTTP server models failed part response after SigV4 authorization', () => {
  const verified = http.indexOf('const trusted = verifyB87S3SigV4(');
  const denied = http.indexOf('response.writeHead(403)');
  const error = http.indexOf('const status = partStatuses.shift()');
  assert.ok(verified > 0 && denied > verified && error > denied);
  assert.match(http, /const partStatuses = \[\.\.\.\(input\.partStatuses \?\? \[\]\)\]/u);
  assert.match(http, /if \(status !== 200\)/u);
  assert.match(verifier, /timingSafeEqual/u);
});
check('B104 signed HTTP covers first, later, completion and lost single PUT failures', () => {
  for (const phrase of [
    'B104 signed HTTP failed first part',
    'B104 signed HTTP failed second part',
    'B104 signed HTTP ambiguous final ACK',
    'B104 signed HTTP single PUT lost ACK',
  ]) assert.ok(http.includes(phrase), phrase);
  assert.match(http, /partial first-part upload cannot be published/u);
  assert.match(http, /owner fencing must own cleanup/u);
});
check('B104 Jest integration checks that failed operation never resubmits', () => {
  for (const phrase of [
    'B104 failed first multipart PUT',
    'B104 failed later multipart PUT',
    'B104 ambiguous multipart final ACK',
    'B104 ambiguous single PUT ACK',
  ]) assert.ok(jest.includes(phrase), phrase);
  assert.match(jest, /cannot complete after a failed operation/u);
  assert.match(jest, /deleteObjectOnAbort: false/u);
});
check('B104 TAP runner enforces all 28 signed HTTP cases and fails on skips', () => {
  const names = [...http.matchAll(/test\('([^']+)'/gu)].map(m => m[1]);
  assert.ok(names.length >= 28);
  assert.equal(new Set(names).size, names.length);
  assert.match(runner, /expectedNames\.length < 61/u);
  assert.match(runner, /'B102 ', 'B103 ', 'B104 '/u);
  assert.match(tap, /summary\.skipped !== 0/u);
  assert.match(tap, /expectedNames\.some\(name => !passing\.includes\(name\)\)/u);
});
check('B104 lifecycle and private production gate remain untouched', () => {
  assert.match(scripts['test:account-export-b104-fail-closed'], /test-account-export-b104-guard\.mjs/u);
  assert.match(scripts['test:account-lifecycle-contract'], /test-account-export-b104-guard\.mjs/u);
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
  assert.match(ops, /## B104/u);
  assert.match(ops, /#353 HOLD/u);
});
console.log('B104 sticky multipart failure: ' + count + '/8 guards PASS');
