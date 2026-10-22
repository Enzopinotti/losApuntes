import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const adapter = read('apps/api/src/files/storage/s3-object-storage.ts');
const headEtag = read('apps/api/src/files/storage/s3-head-etag.ts');
const partEtag = read('apps/api/src/files/storage/s3-multipart-part-etag.ts');
const native = read('scripts/test-account-export-b119-head-etag.test.mjs');
const jest = read('apps/api/src/files/storage/s3-object-storage.spec.ts');
const http = read('scripts/test-account-export-b86-s3-loopback.test.mjs');
const runner = read('scripts/run-account-export-b101-signed-http.mjs');
const proof = read('scripts/testing/b118-proof-contract.mjs');
const ops = read('docs/operations/account-export-artifacts.md');
const config = read('apps/api/src/config/runtime-environment.ts');
const pkg = JSON.parse(read('package.json')).scripts;

let passed = 0;
function check(label, fn) {
  fn();
  passed++;
  console.log('PASS ' + label);
}

check('B119 confirmed HEAD calls strict ETag validator, never strips quotes independently', () => {
  const start = adapter.indexOf('    async headObject(');
  const end = adapter.indexOf('    async readPrefix(', start);
  assert.ok(start > 0 && end > start);
  const code = adapter.slice(start, end);
  assert.match(code, /isConfirmedS3HeadObject\(response\.status\)/u);
  assert.match(code, /parseS3HeadObjectByteSize\(/u);
  assert.match(code, /normalizeS3HeadObjectEtag\(response\.headers\.get\('etag'\)\)/u);
  assert.doesNotMatch(code, /etag:.*replace\(/u);
});

check('B119 shares B108 safe bounded quote parser rather than inventing another ETag dialect', () => {
  assert.match(headEtag, /import \{ normalizeS3MultipartPartEtag \}/u);
  assert.match(headEtag, /if \(raw === null\) return null/u);
  assert.match(headEtag, /normalizeS3MultipartPartEtag\(raw\)/u);
  assert.match(headEtag, /\\x20-\\x7e/u);
  assert.match(native, /abc\\u00a0/u);
  assert.match(headEtag, /S3 HEAD returned an invalid ETag/u);
  assert.match(partEtag, /startsQuote !== endsQuote/u);
  assert.match(partEtag, /token\.length > 254/u);
});

check('B119 native tests reject malformed HEAD metadata and retain absence compatibility', () => {
  assert.match(native, /B119 HEAD accepts a missing optional ETag/u);
  assert.match(native, /B119 HEAD preserves balanced standard/u);
  assert.match(native, /B119 HEAD rejects unbalanced/u);
  assert.match(native, /B119 HEAD rejects unsafe whitespace/u);
  assert.match(native, /B119 HEAD bounds ETags/u);
});

check('B119 real-adapter Jest covers bad and valid HEAD ETags', () => {
  assert.match(jest, /B119 rejects a malformed present HEAD ETag/u);
  assert.match(jest, /B119 keeps missing HEAD ETag optional/u);
  assert.match(jest, /B119 preserves balanced multipart-format/u);
});

check('B119 signed fixture exercises 200 with invalid ETag and never deletes private objects', () => {
  assert.match(http, /B119 signed HEAD rejects malformed present ETags/u);
  assert.match(http, /B119 signed HEAD preserves balanced opaque tokens/u);
  assert.match(http, /verifyB87S3SigV4\(\{/u);
  assert.match(http, /response\.writeHead\(status, headers\)/u);
  assert.match(http, /calls\.some\(call => call\.method === 'DELETE'\), false/u);
});

check('B119 complete signed inventory is 61 unique tests including two B119 cases', () => {
  const names = [...http.matchAll(/test\('([^']+)'/gu)].map(match => match[1]);
  assert.equal(names.length, 61);
  assert.equal(new Set(names).size, 61);
  assert.equal(names.filter(name => name.startsWith('B119 ')).length, 2);
  assert.equal(names.filter(name => name.startsWith('B117 ')).length, 4);
  assert.match(runner, /expectedNames\.length < 61/u);
  assert.match(runner, /'B117 ', 'B119 ', 'B120 '/u);
});

check('B119 local proof cannot mistake 57/57 for the new 61-case acceptance', () => {
  assert.match(proof, /names\.length !== 61/u);
  assert.match(proof, /markers\[0\]\[1\] !== '61'/u);
  assert.match(proof, /total: 61/u);
  assert.match(proof, /passed: 61/u);
});

check('B119 commands and release HOLD stay intact', () => {
  assert.match(pkg['test:account-export-b119-head-etag'], /test-account-export-b119-head-etag\.test\.mjs/u);
  assert.match(pkg['test:account-export-b119-head-etag'], /test-account-export-b119-guard\.mjs/u);
  assert.match(pkg['test:account-lifecycle-contract'], /test-account-export-b119-guard\.mjs/u);
  assert.match(ops, /## B119/u);
  assert.match(ops, /#353 HOLD/u);
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
});

console.log('B119 strict S3 HEAD ETag: ' + passed + '/8 guards PASS');
