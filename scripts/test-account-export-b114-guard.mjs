import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const adapter = read('apps/api/src/files/storage/s3-object-storage.ts');
const contract = read('apps/api/src/files/storage/s3-full-object-read-contract.ts');
const native = read('scripts/test-account-export-b114-full-get-contract.test.mjs');
const jest = read('apps/api/src/files/storage/s3-object-storage.spec.ts');
const http = read('scripts/test-account-export-b86-s3-loopback.test.mjs');
const runner = read('scripts/run-account-export-b101-signed-http.mjs');
const pkg = JSON.parse(read('package.json')).scripts;
const config = read('apps/api/src/config/runtime-environment.ts');
const ops = read('docs/operations/account-export-artifacts.md');

let passed = 0;
function check(name, action) { action(); passed++; console.log('PASS ' + name); }

check('B114 full GET requires HTTP 200 instead of response.ok', () => {
  assert.match(contract, /return status === 200;/u);
  const scope = adapter.slice(adapter.indexOf('    async *readObjectChunks('),
    adapter.indexOf('    createDownloadIntent('));
  assert.match(scope, /isConfirmedS3FullObjectGet\(response\.status\)/u);
  assert.doesNotMatch(scope, /if \(!response\.ok\)/u);
  assert.match(scope, /throw storageError\('GET object', response\.status\)/u);
});

check('B114 cancellation is checked before EOF and between yields', () => {
  assert.match(contract, /signal\?\.aborted/u);
  assert.match(contract, /new DOMException\('S3 GET object was aborted', 'AbortError'\)/u);
  const scope = adapter.slice(adapter.indexOf('    async *readObjectChunks('),
    adapter.indexOf('    createDownloadIntent('));
  assert.ok([...scope.matchAll(/assertS3FullObjectReadActive\(signal\)/gu)].length >= 4);
  assert.match(scope, /if \(result\.done\) \{\s*assertS3FullObjectContentLength\(expectedBytes, receivedBytes, true\);\s*streamEnded = true/u);
  assert.match(scope, /await Promise\.resolve\(cancellation\)/u);
});

check('B114 preserves bounded full GET stream and rejects invalid chunks', () => {
  assert.match(adapter, /maximumChunkBytes < 1024/u);
  assert.match(adapter, /maximumChunkBytes > 1024 \* 1024/u);
  assert.match(adapter, /S3 GET object returned invalid bytes/u);
  assert.match(adapter, /Math\.min\(offset \+ maximumChunkBytes, result\.value\.byteLength\)/u);
});

check('B114 does not change B111 signed prefix GET', () => {
  const scope = adapter.slice(adapter.indexOf('    async readPrefix('),
    adapter.indexOf('    async *readObjectChunks('));
  assert.match(scope, /return readBoundedS3PrefixBody\(response, maximumBytes\)/u);
  assert.doesNotMatch(scope, /isConfirmedS3FullObjectGet/u);
  assert.match(scope, /maximumBytes - 1/u);
});

check('B114 native regression includes abort and valid status paths', () => {
  assert.match(native, /B114 rejects 206 even when it carries/u);
  assert.match(native, /B114 signal cancellation becomes AbortError/u);
  assert.match(native, /B114 cancellation is authoritative/u);
  assert.match(native, /B114 no-signal and active signals never block/u);
});

check('B114 Jest prevents partial full GET and false EOF on abort', () => {
  assert.match(jest, /B114 rejects HTTP %s on full object GET/u);
  assert.match(jest, /B114 abort after first chunk throws AbortError/u);
  assert.match(jest, /pendingRead\)\.rejects\.toMatchObject\(\{ name: 'AbortError' \}\)/u);
});

check('B114 signed HTTP inventory requires all 61 unique tests', () => {
  const names = [...http.matchAll(/test\('([^']+)'/gu)].map(m => m[1]);
  assert.equal(names.length, 61);
  assert.equal(new Set(names).size, 61);
  assert.equal(names.filter(n => n.startsWith('B114 ')).length, 2);
  assert.match(http, /B114 signed full GET refuses HTTP 206/u);
  assert.match(http, /B114 signed full GET abort between chunks/u);
  assert.match(http, /verifyB87S3SigV4\(\{/u);
  assert.match(runner, /expectedNames\.length < 61/u);
  assert.match(runner, /'B113 ', 'B114 '/u);
});

check('B114 remains release-HOLD with native contract command', () => {
  assert.match(pkg['test:account-export-b114-full-get'],
    /test-account-export-b114-full-get-contract\.test\.mjs/u);
  assert.match(pkg['test:account-lifecycle-contract'],
    /test-account-export-b114-guard\.mjs/u);
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
  assert.match(ops, /## B114/u);
  assert.match(ops, /#353 HOLD/u);
});

console.log('B114 full GET and AbortSignal: ' + passed + '/8 source checks PASS');
