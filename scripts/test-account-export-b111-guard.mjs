import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const range = read('apps/api/src/files/storage/s3-prefix-content-range.ts');
const stream = read('apps/api/src/files/storage/s3-bounded-prefix-body.ts');
const adapter = read('apps/api/src/files/storage/s3-object-storage.ts');
const native = read('scripts/test-account-export-b111-content-range.test.mjs');
const jest = read('apps/api/src/files/storage/s3-object-storage.spec.ts');
const http = read('scripts/test-account-export-b86-s3-loopback.test.mjs');
const runner = read('scripts/run-account-export-b101-signed-http.mjs');
const b110 = read('scripts/test-account-export-b110-guard.mjs');
const pkg = JSON.parse(read('package.json')).scripts;
const ops = read('docs/operations/account-export-artifacts.md');
const config = read('apps/api/src/config/runtime-environment.ts');

let count = 0;
function check(name, run) { run(); count++; console.log('PASS ' + name); }

check('B111 HTTP 206 must bind byte-zero window to requested prefix', () => {
  assert.match(range, /status === 200/u);
  assert.match(range, /status !== 206/u);
  assert.match(range, /start !== 0/u);
  assert.match(range, /end !== Math\.min\(maximumBytes, total\) - 1/u);
  assert.match(range, /Number\.isSafeInteger/u);
});

check('B111 range metadata rejects unknown lengths and non-canonical ranges', () => {
  assert.match(range, /\^bytes /u);
  assert.match(range, /S3 GET prefix returned an invalid Content-Range/u);
  assert.match(range, /S3 GET prefix returned a mismatched Content-Range/u);
  assert.match(native, /unknown-size, unsafe and malformed range metadata/u);
});

check('B111 validation happens before stream read and controls actual body length', () => {
  const validate = stream.indexOf('expectedS3PrefixBytes(');
  const reading = stream.indexOf('await reader.read()');
  assert.ok(validate > 0 && reading > validate);
  assert.match(stream, /total !== expectedBytes/u);
  assert.match(stream, /S3 GET prefix returned a truncated Content-Range body/u);
  assert.match(stream, /await reader\.cancel\(\)\.catch/u);
});

check('B111 keeps B109 incremental ceiling and valid HTTP 200 compatibility', () => {
  assert.match(stream, /value\.byteLength > maximumBytes - total/u);
  assert.match(stream, /if \(value\.byteLength === 0\) continue/u);
  assert.match(stream, /response\.status === undefined/u);
  assert.match(adapter, /return readBoundedS3PrefixBody\(response, maximumBytes\)/u);
  assert.match(native, /HTTP 200 full-object compatibility remains bounded/u);
});

check('B111 native test covers content range offset, truncation and cancellation', () => {
  assert.match(native, /HTTP 206 accepts exactly the requested first bytes/u);
  assert.match(native, /rejects a different start offset or truncated remote window/u);
  assert.match(native, /rejects provider body shorter/u);
  assert.match(native, /invalid Content-Range cancels upstream stream/u);
  assert.match(native, /metadata cannot bypass existing maximumBytes/u);
});

check('B111 Nest/Jest verifies 206 wrong offset, length and correct small objects', () => {
  assert.match(jest, /B111 rejects HTTP 206 that reports a foreign offset/u);
  assert.match(jest, /B111 rejects truncated HTTP 206 body/u);
  assert.match(jest, /B111 accepts HTTP 206 on a shorter complete object/u);
  assert.match(jest, /bytes 0-7\/8/u);
});

check('B111 signed HTTP requires all 61 real test groups and provider 206 faults', () => {
  const names = [...http.matchAll(/test\('([^']+)'/gu)].map(m => m[1]);
  assert.equal(names.length, 61);
  assert.equal(new Set(names).size, 61);
  assert.equal(names.filter(n => n.startsWith('B111 ')).length, 2);
  assert.match(http, /B111 signed HTTP confirms exact byte-zero Content-Range/u);
  assert.match(http, /B111 signed HTTP refuses foreign and truncated HTTP 206 ranges/u);
  assert.match(http, /verifyB87S3SigV4\(\{/u);
  assert.match(runner, /expectedNames\.length < 61/u);
  assert.match(runner, /'B110 ', 'B111 '/u);
  assert.match(b110, /names\.length, 61/u);
});

check('B111 commands preserve Node24 gate, release HOLD and disabled production', () => {
  assert.match(pkg['test:account-export-b111-content-range'],
    /register-api-typescript\.mjs/u);
  assert.match(pkg['test:account-lifecycle-contract'],
    /test-account-export-b111-guard\.mjs/u);
  assert.match(pkg['test:account-export-b107-release-acceptance'],
    /run-account-export-b101-signed-http\.mjs/u);
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
  assert.match(ops, /## B111/u);
  assert.match(ops, /#353 HOLD/u);
});

console.log('B111 S3 Content-Range binding: ' + count + '/8 guards PASS');
