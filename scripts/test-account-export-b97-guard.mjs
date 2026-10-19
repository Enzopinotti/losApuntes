import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const reader = read('apps/api/src/files/storage/s3-multipart-response-body.ts');
const s3 = read('apps/api/src/files/storage/s3-object-storage.ts');
const xml = read('apps/api/src/files/storage/s3-multipart-completion.ts');
const nodeTests = read('scripts/test-account-export-b97-bounded-multipart.test.mjs');
const jest = read('apps/api/src/files/storage/s3-object-storage.spec.ts');
const tcp = read('scripts/test-account-export-b86-s3-loopback.test.mjs');
const scripts = JSON.parse(read('package.json')).scripts;
const ops = read('docs/operations/account-export-artifacts.md');

let passed = 0;
function check(name, fn) { fn(); passed++; console.log('PASS ' + name); }

check('B97 enforces a constant 64KiB raw byte cap', () => {
  assert.match(reader, /MAX_S3_MULTIPART_COMPLETION_BYTES = 64 \* 1024/u);
  assert.match(reader, /value\.byteLength > MAX_S3_MULTIPART_COMPLETION_BYTES - size/u);
  assert.match(reader, /size \+= value\.byteLength/u);
});
check('B97 byte cap happens before decode/accumulation', () => {
  assert.ok(reader.indexOf('value.byteLength > MAX_S3_MULTIPART') <
    reader.indexOf("xml += decoder.decode(value"));
});
check('B97 cancellation releases provider resources on overflow/error', () => {
  assert.match(reader, /await reader\.cancel\(\)\.catch/u);
  assert.match(reader, /reader\.releaseLock\(\)/u);
});
check('B97 rejects invalid UTF8 instead of repairing XML', () => {
  assert.match(reader, /TextDecoder\('utf-8', \{ fatal: true \}\)/u);
  assert.match(reader, /value instanceof Uint8Array/u);
});
check('B97 still requires semantically valid B96 XML', () => {
  assert.match(s3, /isConfirmedS3MultipartCompletion\(xml, \{/u);
  assert.match(xml, /CompleteMultipartUploadResult/u);
});
check('B97 checks HTTP success and bounded XML before marking the writer committed', () => {
  const start = s3.indexOf("async complete(): Promise<void>");
  const end = s3.indexOf("async abort(): Promise<void>", start);
  const body = s3.slice(start, end);
  const status = body.lastIndexOf('if (!isConfirmedS3WriteAcknowledgement(response.status))');
  const bounded = body.indexOf('readBoundedS3MultipartCompletionXml(response)');
  const semantic = body.indexOf('isConfirmedS3MultipartCompletion(xml, {');
  const committed = body.lastIndexOf('completed = true;');
  assert.ok(status >= 0 && bounded > status && semantic > bounded && committed > semantic);
  assert.doesNotMatch(body, /response\.text\(\)/u);
});
check('B97 preserves private uploadId-only abort without object deletion', () => {
  assert.match(s3, /input\.deleteObjectOnAbort !== false/u);
  assert.match(jest, /B97 caps and cancels an oversized HTTP 200/u);
  assert.match(jest, /B97 rejects invalid UTF-8 multipart XML/u);
  assert.match(jest, /deleteObjectOnAbort: false/u);
});
check('B97 includes a real signed local HTTP over-limit regression', () => {
  assert.match(tcp, /B97 signed HTTP 200 multipart caps/u);
  assert.match(tcp, /completeMultipartBody: 'x'\.repeat\(64 \* 1024 \+ 1\)/u);
  assert.match(tcp, /server\.listen\(0, '127\.0\.0\.1', resolve\)/u);
});
check('B97 executable tests contain 12 cases including HTTP localhost', () => {
  assert.equal((nodeTests.match(/test\('/gu) ?? []).length, 12);
  assert.match(nodeTests, /B97 real localhost HTTP 200 oversized XML/u);
  assert.match(nodeTests, /B97 cancellation failure cannot conceal/u);
});
check('B97 lifecycle preserves B86 through B96 and wires B97', () => {
  const suite = scripts['test:account-lifecycle-contract'];
  assert.match(suite, /test-account-export-b86-s3-loopback\.test\.mjs/u);
  assert.match(suite, /test-account-export-b96-multipart-response\.test\.mjs/u);
  assert.match(suite, /test-account-export-b97-bounded-multipart\.test\.mjs/u);
  assert.match(suite, /test-account-export-b97-guard\.mjs/u);
  assert.match(scripts['test:account-export-b97-multipart'],
    /test-account-export-b97-bounded-multipart\.test\.mjs/u);
});
check('B97 does not lift the release HOLD', () => {
  assert.match(ops, /## B97/u);
  assert.match(ops, /#353 HOLD/u);
});
console.log('B97 bounded S3 response: ' + passed + ' structural contracts PASS');
