import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const adapter = read('apps/api/src/files/storage/s3-object-storage.ts');
const contract = read('apps/api/src/files/storage/s3-write-ack-status.ts');
const native = read('scripts/test-account-export-b113-write-ack-status.test.mjs');
const jest = read('apps/api/src/files/storage/s3-object-storage.spec.ts');
const signed = read('scripts/test-account-export-b86-s3-loopback.test.mjs');
const runner = read('scripts/run-account-export-b101-signed-http.mjs');
const tap = read('scripts/testing/b101-signed-http-tap.mjs');
const pkg = JSON.parse(read('package.json')).scripts;
const ops = read('docs/operations/account-export-artifacts.md');
const config = read('apps/api/src/config/runtime-environment.ts');

let passed = 0;
function check(name, verify) {
  verify();
  passed++;
  console.log('PASS ' + name);
}

check('B113 confirms writes only with HTTP 200, not arbitrary successful 2xx', () => {
  assert.match(contract, /return status === 200;/u);
  assert.match(native, /202 Accepted as evidence that bytes were committed/u);
  assert.match(native, /204 success without a completed PutObject ACK/u);
  assert.match(native, /206 from being mistaken for UploadPart success/u);
});

check('B113 calls the exact 200 guard for all four write stages', () => {
  const confirmations = [...adapter.matchAll(/isConfirmedS3WriteAcknowledgement\(response\.status\)/gu)];
  assert.equal(confirmations.length, 4);
  for (const name of [
    'Create multipart upload', 'Upload multipart part',
    'PUT object', 'Complete multipart upload',
  ]) assert.ok(adapter.includes("storageError('" + name + "'"), name);
  const from = adapter.indexOf('      const start = async () =>');
  const to = adapter.indexOf('      // B105:', from);
  assert.ok(from >= 0 && to > from);
  assert.doesNotMatch(adapter.slice(from, to), /if \(!response\.ok\)/u);
});

check('B113 keeps B104 fail-closed semantics after ambiguous writes', () => {
  assert.match(adapter, /failed = true/u);
  assert.match(adapter, /S3 multipart writer cannot complete after a failed operation/u);
  assert.match(adapter, /deleteObjectOnAbort !== false/u);
  assert.match(adapter, /void response\.body\?\.cancel\(\)\.catch/u);
});

check('B113 abort uses its own idempotent 200/204/404 acknowledgement', () => {
  assert.match(contract, /status === 204 \|\| status === 200 \|\| status === 404/u);
  assert.match(adapter, /isConfirmedS3MultipartAbort\(response\.status\)/u);
  assert.match(native, /abort must not report success on an asynchronous/u);
  assert.match(jest, /B113 ambiguous HTTP 202 abort cannot be mistaken/u);
});

check('B113 Jest rejects false write ACK and retries safe abort with uploadId', () => {
  assert.match(jest, /B113 rejects single PutObject HTTP/u);
  assert.match(jest, /B113 rejects HTTP 202 even when multipart initiation/u);
  assert.match(jest, /B113 rejects HTTP 206 part ACK/u);
  assert.match(jest, /B113 rejects HTTP 202 completion/u);
  assert.match(jest, /searchParams\.get\('uploadId'\)/u);
});

check('B113 real signed TCP fixtures simulate provider ambiguity for five operations', () => {
  for (const name of [
    'B113 signed HTTP refuses 202 single PUT',
    'B113 signed HTTP refuses 202 initiation',
    'B113 signed HTTP refuses 206 UploadPart',
    'B113 signed HTTP refuses 202 completion',
    'B113 signed HTTP refuses accepted-only 202 abort',
  ]) assert.ok(signed.includes(name), name);
  assert.match(signed, /verifyB87S3SigV4\(\{/u);
  assert.match(signed, /abortStatuses\.shift\(\) \?\? 204/u);
  assert.match(signed, /deleteObjectOnAbort: false/u);
});

check('B113 release gate requires all 61 unique signed HTTP cases in Node24', () => {
  const names = [...signed.matchAll(/test\('([^']+)'/gu)].map(m => m[1]);
  assert.equal(names.length, 61);
  assert.equal(new Set(names).size, 61);
  assert.equal(names.filter(name => name.startsWith('B113 ')).length, 5);
  assert.match(runner, /expectedNames\.length < 61/u);
  assert.match(runner, /'B112 ', 'B113 '/u);
  assert.match(tap, /summary\.skipped !== 0/u);
  assert.match(runner, /classifyB107SignedHttpRuntime\(/u);
});

check('B113 lifecycle and release HOLD remain strict', () => {
  assert.match(pkg['test:account-export-b113-write-ack'],
    /test-account-export-b113-write-ack-status\.test\.mjs/u);
  assert.match(pkg['test:account-lifecycle-contract'],
    /test-account-export-b113-guard\.mjs/u);
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
  assert.match(ops, /## B113/u);
  assert.match(ops, /#353 HOLD/u);
});

console.log('B113 exact S3 write ACK contract: ' + passed + '/8 guards PASS');
