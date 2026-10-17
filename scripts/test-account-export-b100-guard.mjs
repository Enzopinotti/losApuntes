import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const s3 = read('apps/api/src/files/storage/s3-object-storage.ts');
const reader = read('apps/api/src/files/storage/s3-multipart-response-body.ts');
const initiation = read('apps/api/src/files/storage/s3-multipart-initiation.ts');
const nodeTests = read('scripts/test-account-export-b100-s3-initiation.test.mjs');
const jest = read('apps/api/src/files/storage/s3-object-storage.spec.ts');
const http = read('scripts/test-account-export-b86-s3-loopback.test.mjs');
const scripts = JSON.parse(read('package.json')).scripts;
const ops = read('docs/operations/account-export-artifacts.md');
const config = read('apps/api/src/config/runtime-environment.ts');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log('PASS ' + name); }

check('B100 start never uses an unbounded response.text or unsafe UploadId regex', () => {
  const start = s3.indexOf('const start = async () =>');
  const end = s3.indexOf('const uploadPart = async', start);
  const segment = s3.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.doesNotMatch(segment, /response\.text\(\)/u);
  assert.doesNotMatch(segment, /<UploadId>\(\[\^<\]\+\)/u);
  const bounded = segment.indexOf('readBoundedS3MultipartInitiationXml(response)');
  const parsed = segment.indexOf('parseConfirmedS3MultipartUploadId(xml, {');
  const assigned = segment.indexOf('uploadId = confirmedUploadId');
  assert.ok(bounded >= 0 && parsed > bounded && assigned > parsed);
  assert.match(segment, /bucket: options\.bucket/u);
  assert.match(segment, /objectKey: input\.objectKey/u);
});

check('B100 init reuses B97 cancellation, bounded bytes and fatal UTF-8', () => {
  assert.match(reader, /readBoundedS3MultipartInitiationXml/u);
  assert.match(reader, /return readBoundedS3MultipartCompletionXml\(response, 'initiation'\)/u);
  assert.match(reader, /value\.byteLength > MAX_S3_MULTIPART_COMPLETION_BYTES - size/u);
  assert.match(reader, /TextDecoder\('utf-8', \{ fatal: true \}\)/u);
  assert.match(reader, /await reader\.cancel\(\)\.catch/u);
});

check('B100 XML parser refuses unknown or duplicate upload generations', () => {
  assert.match(initiation, /parseConfirmedS3MultipartUploadId/u);
  assert.match(initiation, /InitiateMultipartUploadResult/u);
  assert.match(initiation, /seen\.has\(name\)/u);
  assert.match(initiation, /uploadId\.length > 2048/u);
  assert.match(nodeTests, /forged HTTP 200 response/u);
  assert.match(nodeTests, /bound to another bucket or object key/u);
  assert.match(initiation, /responseBucket !== expected\.bucket/u);
  assert.match(initiation, /responseKey !== expected\.objectKey/u);
});

check('B100 Node suite includes real localhost TCP response', () => {
  assert.match(nodeTests, /localhost HTTP 200 overlong initiation/u);
  assert.match(nodeTests, /server\.listen\(0, '127\.0\.0\.1', resolve\)/u);
  assert.match(nodeTests, /cancelled, 1/u);
});

check('B100 Jest proves production writer does not upload forged parts', () => {
  assert.match(jest, /B100 refuses unconfirmed multipart initiation/u);
  assert.match(jest, /B100 cancels oversized HTTP 200 initiation/u);
  assert.match(jest, /B100 decodes a confirmed AWS UploadId/u);
});

check('B100 signed HTTP loopback tests ensure no object DELETE', () => {
  assert.match(http, /input\.initiateMultipartBody \?\?/u);
  assert.match(http, /B100 signed HTTP refuses oversized initiation/u);
  assert.match(http, /B100 signed HTTP rejects forged initiation/u);
  assert.match(http, /calls\.map\(call => call\.method\), \['POST'\]/u);
});

check('B100 preserves B96-99 and original private abort protections', () => {
  const chain = scripts['test:account-lifecycle-contract'];
  for (const id of ['b86-s3-loopback', 'b96-multipart-response',
    'b97-bounded-multipart', 'b99-multipart-xml', 'b100-s3-initiation']) {
    assert.ok(chain.includes(id), id + ' remains in lifecycle');
  }
  assert.match(s3, /input\.deleteObjectOnAbort !== false/u);
  assert.match(s3, /isConfirmedS3MultipartCompletion\(xml, \{/u);
});

check('B100 has dedicated runnable command and release stays HOLD', () => {
  assert.match(scripts['test:account-export-b100-initiation'],
    /test-account-export-b100-s3-initiation\.test\.mjs/u);
  assert.match(ops, /## B100/u);
  assert.match(ops, /#353 HOLD/u);
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
});

console.log('B100 S3 initiation: ' + passed + '/8 source guards PASS');
