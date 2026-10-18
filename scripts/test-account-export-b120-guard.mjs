import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const adapter = read('apps/api/src/files/storage/s3-object-storage.ts');
const status = read('apps/api/src/files/storage/s3-write-ack-status.ts');
const native = read('scripts/test-account-export-b120-delete-confirmation.test.mjs');
const jest = read('apps/api/src/files/storage/s3-object-storage.spec.ts');
const http = read('scripts/test-account-export-b86-s3-loopback.test.mjs');
const runner = read('scripts/run-account-export-b101-signed-http.mjs');
const proof = read('scripts/testing/b118-proof-contract.mjs');
const config = read('apps/api/src/config/runtime-environment.ts');
const ops = read('docs/operations/account-export-artifacts.md');
const pkg = JSON.parse(read('package.json')).scripts;
let passed = 0;
function check(label, fn) { fn(); passed++; console.log('PASS ' + label); }

check('B120 DeleteObject refuses ambiguous 2xx independently of response.ok', () => {
  const start = adapter.indexOf('  const deleteObject = async (');
  const end = adapter.indexOf('  return Object.freeze({', start);
  assert.ok(start >= 0 && end > start);
  const code = adapter.slice(start, end);
  assert.match(code, /isConfirmedS3ObjectDelete\(response\.status\)/u);
  assert.match(code, /throw storageError\('DELETE', response\.status\)/u);
  assert.doesNotMatch(code, /response\.ok/u);
});

check('B120 terminal DeleteObject contract is strict and distinct from multipart abort', () => {
  assert.match(status, /function isConfirmedS3ObjectDelete\(status: number\)/u);
  assert.match(status, /return status === 204 \|\| status === 200 \|\| status === 404/u);
  assert.match(status, /function isConfirmedS3MultipartAbort\(/u);
  assert.match(adapter, /isConfirmedS3MultipartAbort\(/u);
});

check('B120 native contract covers terminal 200/204/404 and ambiguous 202/206', () => {
  assert.match(native, /B120 accepts terminal S3 DeleteObject/u);
  assert.match(native, /B120 refuses 202 Accepted and 206 Partial Content/u);
  assert.match(native, /B120 refuses transient provider/u);
  assert.match(native, /B120 never treats invalid or non-integer/u);
});

check('B120 Jest verifies real S3 adapter refuses ambiguous 2xx and preserves compatibility', () => {
  assert.match(jest, /B120 refuses ambiguous HTTP %s on signed DeleteObject/u);
  assert.match(jest, /B120 confirms compatible HTTP 200 and idempotent 404/u);
  assert.match(jest, /S3 DELETE failed with HTTP /u);
});

check('B120 real localhost TCP scenario independently checks SigV4 before DELETE', () => {
  const trust = http.indexOf('const trusted = verifyB87S3SigV4({');
  const del = http.indexOf("} else if (method === 'DELETE') {");
  assert.ok(trust > 0 && del > trust);
  assert.match(http, /B120 signed DELETE rejects 202 and 206 whether provider kept or removed bytes/u);
  assert.match(http, /B120 signed DELETE accepts only terminal 200, 204 and idempotent 404/u);
  assert.match(http, /no unsafe automatic retry of an ambiguous private generation/u);
});

check('B120 signed TAP requires all 61 unique groups with two new DELETE cases', () => {
  const names = [...http.matchAll(/test\('([^']+)'/gu)].map(match => match[1]);
  assert.equal(names.length, 61);
  assert.equal(new Set(names).size, 61);
  assert.equal(names.filter(name => name.startsWith('B120 ')).length, 2);
  assert.match(runner, /expectedNames\.length < 61/u);
  assert.match(runner, /'B119 ', 'B120 '/u);
});

check('B120 invalidates legacy 59-case local release proof', () => {
  assert.match(proof, /names\.length !== 61/u);
  assert.match(proof, /markers\[0\]\[1\] !== '61'/u);
  assert.match(proof, /total: 61/u);
  assert.match(proof, /passed: 61/u);
});

check('B120 lifecycle runs native contract and guard without releasing Study Progress', () => {
  assert.match(pkg['test:account-export-b120-delete'], /test-account-export-b120-delete-confirmation\.test\.mjs/u);
  assert.match(pkg['test:account-export-b120-delete'], /test-account-export-b120-guard\.mjs/u);
  assert.match(pkg['test:account-lifecycle-contract'], /test-account-export-b120-guard\.mjs/u);
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
  assert.match(ops, /## B120/u);
  assert.match(ops, /#353 HOLD/u);
});

console.log('B120 strict private S3 DeleteObject: ' + passed + '/8 guards PASS');
