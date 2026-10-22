import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const adapter = read('apps/api/src/files/storage/s3-object-storage.ts');
const headerCollector = read('apps/api/src/files/storage/s3-signed-request-headers.ts');
const native = read('scripts/test-account-export-b110-signed-headers.test.mjs');
const jest = read('apps/api/src/files/storage/s3-object-storage.spec.ts');
const http = read('scripts/test-account-export-b86-s3-loopback.test.mjs');
const verifier = read('scripts/testing/b87-s3-sigv4-verifier.mjs');
const runner = read('scripts/run-account-export-b101-signed-http.mjs');
const b109 = read('scripts/test-account-export-b109-guard.mjs');
const pkg = JSON.parse(read('package.json')).scripts;
const config = read('apps/api/src/config/runtime-environment.ts');
const ops = read('docs/operations/account-export-artifacts.md');

let count = 0;
function check(label, fn) {
  fn();
  count++;
  console.log('PASS ' + label);
}

check('B110 server GET/HEAD/DELETE includes caller headers in SigV4 material', () => {
  const from = adapter.indexOf('async function signedRequest(input: {');
  const to = adapter.indexOf('async function signedBodyRequest(input: {', from);
  assert.ok(from >= 0 && to > from);
  const request = adapter.slice(from, to);
  assert.match(request, /collectS3SignedRequestHeaders\(/u);
  assert.match(request, /input\.headers,/u);
  assert.match(request, /const signedHeaders = \[\.\.\.signingHeaders\.keys\(\)\]\.sort\(\)\.join\(';'\)/u);
  assert.match(request, /const canonicalHeaders = \[\.\.\.signingHeaders\.entries\(\)\]/u);
  assert.match(request, /\.\.\.\(input\.headers \?\? \{\}\)/u);
});

check('B110 signed Range comes from the real prefix GET with unchanged budget', () => {
  const from = adapter.indexOf('    async readPrefix(');
  const to = adapter.indexOf('    async *readObjectChunks(', from);
  const part = adapter.slice(from, to);
  assert.match(part, /range: /u);
  assert.match(part, /maximumBytes - 1/u);
  assert.match(part, /readBoundedS3PrefixBody\(response, maximumBytes\)/u);
  assert.doesNotMatch(part, /arrayBuffer\(\)/u);
});

check('B110 rejects signed reserved, duplicate and injected headers', () => {
  assert.match(headerCollector, /signed\.has\(normalizedName\)/u);
  assert.match(headerCollector, /normalizedName === 'authorization'/u);
  assert.match(headerCollector, /invalid or reserved header/u);
  assert.match(headerCollector, /signed\.set\(normalizedName, value\.trim\(\)\.replace/u);
  assert.match(native, /header-name injection/u);
  assert.match(native, /duplicate extra headers/u);
});

check('B110 native suite proves canonical digest binding and full-read compatibility', () => {
  assert.match(native, /signed canonical request digest changes when Range is altered/u);
  assert.match(native, /no-range HEAD or GET retains original signed key inventory/u);
  assert.match(native, /rejects reserved overrides even with mixed-case names/u);
  assert.match(native, /canonicalizes harmless HTTP whitespace/u);
});

check('B110 Jest integration checks GET Range signing and HEAD/full GET defaults', () => {
  assert.match(jest, /B110 signs the exact Range value requested by the prefix GET/u);
  assert.match(jest, /B110 retains the original signed header set for HEAD and full GET/u);
  assert.match(jest, /SignedHeaders=host;range;x-amz-content-sha256;x-amz-date/u);
  assert.match(jest, /SignedHeaders=host;x-amz-content-sha256;x-amz-date/u);
});

check('B110 localhost signed TCP fixture rejects changed or omitted Range', () => {
  assert.match(http, /B110 signed HTTP binds requested Range to SigV4/u);
  assert.match(http, /B110 signed HTTP full GET without Range/u);
  assert.match(http, /captureGetHeaders/u);
  assert.match(http, /changing signed Range must invalidate request/u);
  assert.match(http, /removing signed Range must invalidate request/u);
  assert.match(verifier, /timingSafeEqual/u);
  assert.match(http, /verifyB87S3SigV4\(\{/u);
});

check('B110 Node24 release inventory now demands all 61 signed TCP scenarios', () => {
  const names = [...http.matchAll(/test\('([^']+)'/gu)].map(m => m[1]);
  assert.equal(names.length, 61);
  assert.equal(new Set(names).size, 61);
  assert.equal(names.filter(n => n.startsWith('B110 ')).length, 2);
  assert.match(runner, /expectedNames\.length < 61/u);
  assert.match(runner, /'B109 ', 'B110 '/u);
  assert.match(b109, /names\.length, 61/u);
});

check('B110 native test and previous release HOLD stay wired into lifecycle', () => {
  assert.match(pkg['test:account-export-b110-signed-range'],
    /test-account-export-b110-signed-headers\.test\.mjs/u);
  assert.match(pkg['test:account-lifecycle-contract'],
    /test-account-export-b110-guard\.mjs/u);
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
  assert.match(ops, /## B110/u);
  assert.match(ops, /#353 HOLD/u);
});

console.log('B110 signed S3 Range integrity: ' + count + '/8 guards PASS');
