import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const helper = read('apps/api/src/files/storage/s3-multipart-completion.ts');
const implementation = read('apps/api/src/files/storage/s3-object-storage.ts');
const unit = read('scripts/test-account-export-b96-multipart-response.test.mjs');
const jest = read('apps/api/src/files/storage/s3-object-storage.spec.ts');
const http = read('scripts/test-account-export-b86-s3-loopback.test.mjs');
const scripts = JSON.parse(read('package.json')).scripts;
const ops = read('docs/operations/account-export-artifacts.md');
const config = read('apps/api/src/config/runtime-environment.ts');
let passed = 0;
function check(label, verify) {
  verify();
  passed += 1;
  console.log('PASS ' + label);
}

check('B96 fail-closed XML confirmation helper is an independent production module', () => {
  assert.match(helper, /isConfirmedS3MultipartCompletion/u);
  assert.match(helper, /CompleteMultipartUploadResult/u);
  assert.match(helper, /xml\.length > 64 \* 1024/u);
});
check('B96 embedded S3 Error is rejected even if the status is HTTP 200', () => {
  assert.match(helper, /Error\(\?:/u);
  assert.match(unit, /B96 recognizes S3 Error in HTTP 200/u);
});
check('B96 empty, HTML, truncated or sibling XML envelopes cannot signal success', () => {
  assert.match(unit, /B96 rejects blank HTTP 200/u);
  assert.match(unit, /B96 malformed or partial/u);
  assert.match(unit, /multiple sibling envelopes/u);
});
check('B103 preserves realistic S3 result while rejecting empty B86 ACK', () => {
  assert.match(unit, /realistic AWS S3 multipart completion XML/u);
  assert.match(unit, /rejects the known self-closing local S3 completion fixture/u);
});
check('B98 preserves B96 semantic XML guard after B97 bounded streaming', () => {
  const start = implementation.indexOf('async complete(): Promise<void>');
  const end = implementation.indexOf('async abort(): Promise<void>', start);
  assert.ok(start > 0 && end > start, 'multipart completion block exists');
  const complete = implementation.slice(start, end);
  const status = complete.lastIndexOf('if (!isConfirmedS3WriteAcknowledgement(response.status))');
  const bounded = complete.indexOf('const xml = await readBoundedS3MultipartCompletionXml(response);');
  const checked = complete.indexOf('!isConfirmedS3MultipartCompletion(xml, {');
  const committed = complete.lastIndexOf('completed = true;');
  assert.ok(status >= 0 && bounded > status && checked > bounded && committed > checked,
    'HTTP success, bounded read and B96 semantic validation precede commit');
  assert.doesNotMatch(complete, /response\.text\(\)/u,
    'multipart response must never be buffered without a byte cap');
});
check('B96 abort remains generation-safe for private exports', () => {
  assert.match(implementation, /if \(input\.deleteObjectOnAbort !== false\)/u);
  assert.match(jest, /B96 rejects HTTP 200 multipart/u);
  assert.match(jest, /deleteObjectOnAbort: false/u);
  assert.match(http, /B96 real signed HTTP multipart rejects/u);
  assert.match(http, /assert\.equal\(objects\.has\(PATH\), true\)/u);
});
check('B96 signed HTTP test simulates provider commit with unconfirmed reply', () => {
  assert.match(http, /input\.completeMultipartBody \?\?/u);
  assert.match(http, /'<Error><Code>InternalError<\/Code><\/Error>'/u);
  assert.match(http, /await writer\.abort\(\)/u);
});
check('B96 preserves B86/B87/B95 signed loopback regression matrix', () => {
  for (const block of ['B86 signed real HTTP', 'B87 loopback rejects', 'B95 exact authenticated HTTP']) {
    assert.ok(http.includes(block));
  }
});
check('B96 new executable suite is wired in account lifecycle', () => {
  const chain = scripts['test:account-lifecycle-contract'];
  assert.match(chain, /test-account-export-b96-multipart-response\.test\.mjs/u);
  assert.match(chain, /test-account-export-b96-guard\.mjs/u);
  assert.match(scripts['test:account-export-b96-multipart'],
    /test-account-export-b96-multipart-response\.test\.mjs/u);
});
check('B96 release remains held pending Mongo and provider validation', () => {
  assert.match(ops, /## B96/u);
  assert.match(ops, /#353 HOLD/u);
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
});
console.log('B96 S3 multipart completion: ' + passed + ' source contracts PASS');
