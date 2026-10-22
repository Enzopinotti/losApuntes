import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const adapter = read('apps/api/src/files/storage/s3-object-storage.ts');
const length = read('apps/api/src/files/storage/s3-full-object-length.ts');
const native = read('scripts/test-account-export-b115-full-get-length.test.mjs');
const jest = read('apps/api/src/files/storage/s3-object-storage.spec.ts');
const http = read('scripts/test-account-export-b86-s3-loopback.test.mjs');
const runner = read('scripts/run-account-export-b101-signed-http.mjs');
const b114 = read('scripts/test-account-export-b114-guard.mjs');
const pkg = JSON.parse(read('package.json')).scripts;
const ops = read('docs/operations/account-export-artifacts.md');
const config = read('apps/api/src/config/runtime-environment.ts');

let passed = 0;
function check(label, verify) {
  verify();
  passed++;
  console.log('PASS ' + label);
}

check('B115 full object GET binds received bytes to optional Content-Length', () => {
  assert.match(length, /parseS3FullObjectContentLength/u);
  assert.match(length, /assertS3FullObjectContentLength/u);
  assert.match(length, /if \(raw === null\) return null/u);
  assert.match(length, /Number\.isSafeInteger\(bytes\)/u);
  assert.match(length, /received > expected/u);
  assert.match(length, /atEndOfStream && received !== expected/u);
});

check('B115 full GET rejects malformed and unsafe metadata', () => {
  assert.match(length, /S3 GET object returned an invalid Content-Length/u);
  assert.match(length, /S3 GET object exceeded declared Content-Length/u);
  assert.match(length, /S3 GET object returned a truncated Content-Length body/u);
  assert.match(native, /B115 rejects malformed, noncanonical and unsafe/u);
  assert.match(native, /B115 impossible counters cannot silently wrap/u);
});

check('B115 validates chunks before exposure and checks natural EOF', () => {
  const start = adapter.indexOf('    async *readObjectChunks(');
  const end = adapter.indexOf('    createDownloadIntent(', start);
  assert.ok(start > 0 && end > start);
  const scope = adapter.slice(start, end);
  const chunkCheck = scope.indexOf('assertS3FullObjectContentLength(expectedBytes, receivedBytes, false)');
  const emit = scope.indexOf('yield result.value.subarray(');
  assert.ok(chunkCheck >= 0 && emit > chunkCheck);
  assert.match(scope, /assertS3FullObjectContentLength\(expectedBytes, receivedBytes, true\)/u);
  assert.match(scope, /receivedBytes \+= result\.value\.byteLength/u);
});

check('B115 validates inside the existing abort-safe reader lifecycle', () => {
  const scope = adapter.slice(adapter.indexOf('    async *readObjectChunks('),
    adapter.indexOf('    createDownloadIntent('));
  const tryStart = scope.indexOf('      try {');
  const parse = scope.indexOf('parseS3FullObjectContentLength(');
  assert.ok(tryStart >= 0 && parse > tryStart);
  assert.match(scope, /if \(!streamEnded\) cancelReader\(\)/u);
  assert.match(scope, /reader\.releaseLock\(\)/u);
  assert.match(scope, /assertS3FullObjectReadActive\(signal\)/u);
});

check('B115 native tests include exact and chunked reads as well as false EOF', () => {
  for (const name of [
    'B115 accepts exactly the declared body size',
    'B115 fails closed on natural EOF',
    'B115 rejects extra bytes before exposing',
    'B115 missing Content-Length retains chunked',
    'B115 stopping early is not confused',
  ]) assert.ok(native.includes(name), name);
});

check('B115 Jest covers early EOF, overflow, malformed length and voluntary stop', () => {
  for (const name of [
    'B115 rejects a truncated full GET',
    'B115 rejects excess GET bytes',
    'B115 rejects invalid or unsafe full GET',
    'B115 accepts exact length and streaming',
    'B115 early downstream iterator.return',
  ]) assert.ok(jest.includes(name), name);
});

check('B115 signed localhost TCP inventory now requires all 61 cases', () => {
  const names = [...http.matchAll(/test\('([^']+)'/gu)].map(m => m[1]);
  assert.equal(names.length, 61);
  assert.equal(new Set(names).size, 61);
  assert.equal(names.filter(name => name.startsWith('B115 ')).length, 2);
  assert.match(http, /B115 signed GET verifies a declared exact private object length/u);
  assert.match(http, /B115 signed GET must not accept a prematurely terminated/u);
  assert.match(http, /verifyB87S3SigV4\(\{/u);
  assert.match(runner, /expectedNames\.length < 61/u);
  assert.match(runner, /'B114 ', 'B115 '/u);
  assert.match(b114, /names\.length, 61/u);
});

check('B115 remains release HOLD with native and lifecycle commands', () => {
  assert.match(pkg['test:account-export-b115-full-get-length'],
    /test-account-export-b115-full-get-length\.test\.mjs/u);
  assert.match(pkg['test:account-lifecycle-contract'],
    /test-account-export-b115-guard\.mjs/u);
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
  assert.match(ops, /## B115/u);
  assert.match(ops, /#353 HOLD/u);
});

console.log('B115 full GET Content-Length integrity: ' + passed + '/8 guards PASS');
