import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const adapter = read('apps/api/src/files/storage/s3-object-storage.ts');
const collector = read('apps/api/src/files/storage/s3-signed-request-headers.ts');
const native = read('scripts/test-account-export-b112-body-headers.test.mjs');
const jest = read('apps/api/src/files/storage/s3-object-storage.spec.ts');
const http = read('scripts/test-account-export-b86-s3-loopback.test.mjs');
const verifier = read('scripts/testing/b87-s3-sigv4-verifier.mjs');
const runner = read('scripts/run-account-export-b101-signed-http.mjs');
const previous = read('scripts/test-account-export-b111-guard.mjs');
const pkg = JSON.parse(read('package.json')).scripts;
const config = read('apps/api/src/config/runtime-environment.ts');
const ops = read('docs/operations/account-export-artifacts.md');

let passed = 0;
function check(label, fn) {
  fn();
  passed++;
  console.log('PASS ' + label);
}

check('B112 multipart signer uses existing B110 validated header collection', () => {
  const start = adapter.indexOf('async function signedBodyRequest(input: {');
  const end = adapter.indexOf('function storageError(', start);
  const body = adapter.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(body, /collectS3SignedRequestHeaders\(/u);
  assert.match(body, /input\.endpoint\.host,\s*payloadHash,\s*amzDate,\s*input\.headers,/u);
  assert.doesNotMatch(body, /const headers = new Map<string, string>/u);
  assert.match(body, /\.\.\.Object\.fromEntries\(headers\)/u);
});

check('B112 rejects signed reserved fields, duplicates and CRLF/NUL injection', () => {
  assert.match(collector, /signed\.has\(normalizedName\)/u);
  assert.match(collector, /normalizedName === 'authorization'/u);
  assert.match(collector, /value\.includes\('\\r'\)[\s\S]*?value\.includes\('\\n'\)[\s\S]*?value\.includes\('\\0'\)/u);
  assert.match(collector, /typeof value !== 'string'/u);
  assert.match(collector, /invalid or reserved header/u);
});

check('B112 actual multipart caller supplies only named content-type header', () => {
  assert.match(adapter, /headers: contentType \? \{ 'content-type': contentType \} : undefined/u);
  assert.match(adapter, /const payloadHash = createHash\('sha256'\)\.update\(body\)\.digest\('hex'\)/u);
  assert.match(adapter, /signedHeaders = \[\.\.\.headers\.keys\(\)\]\.sort\(\)\.join\(';'\)/u);
});

check('B112 native tests cover payload hash, reserved headers, casing and injection', () => {
  assert.match(native, /B112 multipart POST signs content-type and original request payload digest/u);
  assert.match(native, /B112 PUT part signs the real body hash/u);
  assert.match(native, /B112 body path cannot override digest/u);
  assert.match(native, /B112 body signer forbids casing-colliding/u);
  assert.match(native, /B112 body signer rejects newline/u);
  assert.match(native, /B112 multipart body signed metadata is stable/u);
});

check('B112 Jest checks rejected multipart before fetch and positive signed POST/PUT', () => {
  assert.match(jest, /B112 never starts multipart with unsafe signed content-type/u);
  assert.match(jest, /B112 signs content-type for multipart POST/u);
  assert.match(jest, /toHaveBeenCalled/u);
  assert.match(jest, /S3 signed request contains an invalid or reserved header/u);
  assert.match(jest, /deleteObjectOnAbort: false/u);
});

check('B112 independent SigV4 loopback has negative injection and compatible positive', () => {
  assert.match(http, /B112 signed HTTP rejects injected content-type/u);
  assert.match(http, /B112 signed HTTP preserves canonical content-type/u);
  assert.match(http, /verifyB87S3SigV4\(\{/u);
  assert.match(verifier, /timingSafeEqual/u);
  assert.match(http, /captureWriteHeaders/u);
});

check('B112 release inventory requires 61 distinct signed TCP cases', () => {
  const names = [...http.matchAll(/test\('([^']+)'/gu)].map(m => m[1]);
  assert.equal(names.length, 61);
  assert.equal(new Set(names).size, 61);
  assert.equal(names.filter(n => n.startsWith('B112 ')).length, 2);
  assert.match(runner, /expectedNames\.length < 61/u);
  assert.match(runner, /'B111 ', 'B112 '/u);
  assert.match(previous, /names\.length, 61/u);
});

check('B112 participates in lifecycle without disabling private production HOLD', () => {
  assert.match(pkg['test:account-export-b112-signed-body-headers'],
    /test-account-export-b112-body-headers\.test\.mjs/u);
  assert.match(pkg['test:account-lifecycle-contract'],
    /test-account-export-b112-guard\.mjs/u);
  assert.match(pkg['test:account-export-b107-release-acceptance'],
    /run-account-export-b101-signed-http\.mjs/u);
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
  assert.match(ops, /## B112/u);
  assert.match(ops, /#353 HOLD/u);
});

console.log('B112 multipart signed header fencing: ' + passed + '/8 source checks PASS');
