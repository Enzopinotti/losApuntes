import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const result = read('apps/api/src/files/storage/s3-multipart-completion.ts');
const writer = read('apps/api/src/files/storage/s3-object-storage.ts');
const initiation = read('apps/api/src/files/storage/s3-multipart-initiation.ts');
const unit = read('scripts/test-account-export-b102-completion-binding.test.mjs');
const jest = read('apps/api/src/files/storage/s3-object-storage.spec.ts');
const signed = read('scripts/test-account-export-b86-s3-loopback.test.mjs');
const scripts = JSON.parse(read('package.json')).scripts;
const ops = read('docs/operations/account-export-artifacts.md');
const runtime = read('apps/api/src/config/runtime-environment.ts');
let passed = 0;
function check(label, run) { run(); passed++; console.log('PASS ' + label); }

check('B102 bounds the completion XML via existing B97 streaming before commit', () => {
  const complete = writer.slice(
    writer.indexOf('async complete(): Promise<void>'),
    writer.indexOf('async abort(): Promise<void>'),
  );
  const bounded = complete.indexOf('readBoundedS3MultipartCompletionXml(response)');
  const bound = complete.indexOf('isConfirmedS3MultipartCompletion(xml, {');
  const committed = complete.lastIndexOf('completed = true;');
  assert.ok(bounded >= 0 && bound > bounded && committed > bound);
  assert.doesNotMatch(complete, /response\.text\(\)/u);
});

check('B102 binds signed bucket and owner-specific object key at S3 writer boundary', () => {
  assert.match(writer, /isConfirmedS3MultipartCompletion\(xml, \{/u);
  assert.match(writer, /bucket: options\.bucket/u);
  assert.match(writer, /objectKey: input\.objectKey/u);
  assert.match(result, /responseBucket === expected\.bucket/u);
  assert.match(result, /responseKey === expected\.objectKey/u);
});
check('B102 decodes bounded XML entities for comparisons without XML entity expansion', () => {
  assert.match(result, /decodeCompletionXmlField\(fieldText\)/u);
  assert.match(result, /validXmlText\(segment\)/u);
  assert.match(result, /fieldText \+= segment/u);
  assert.match(result, /Number\.parseInt/u);
});
check('B102 rejects another owner bucket/key and preserves B99 XML rules', () => {
  assert.match(unit, /fails closed if S3 HTTP 200 completion/u);
  assert.match(unit, /rejects B86 legacy empty ACK/u);
  assert.match(result, /seenFields\.has\(tag\.name\)/u);
  assert.match(result, /etagSeen\s*&&\s*index === body\.length/u);
});
check('B102 Jest checks private-generation 200 mismatch with multipart-ID-only abort', () => {
  assert.match(jest, /B102 rejects multipart completion from/u);
  assert.match(jest, /private-b102/u);
  assert.match(jest, /deleteObjectOnAbort: false/u);
});
check('B102 signed HTTP simulates provider commit but never deletes private generation', () => {
  assert.match(signed, /B102 signed HTTP rejects foreign completion bucket\/key/u);
  assert.match(signed, /simulated provider already committed bytes/u);
  assert.match(signed, /private generation is not deleted/u);
  assert.match(signed, /B99 signed HTTP accepts a canonical AWS completion/u);
});
check('B102 keeps initiation fence, B90 hash and B86-B101 test inventory', () => {
  assert.match(initiation, /responseBucket !== expected\.bucket/u);
  assert.match(signed, /verifyAccountExportStoredBytes\(storage\.readObjectChunks\(OBJECT_KEY\)/u);
  for (const id of ['b86-s3-loopback', 'b96-multipart-response', 'b97-bounded-multipart',
    'b99-multipart-xml', 'b100-s3-initiation', 'b101-loader', 'b102-completion-binding']) {
    assert.ok(scripts['test:account-lifecycle-contract'].includes(id), id);
  }
});
check('B102 dedicated Node command and release HOLD remain explicit', () => {
  assert.match(scripts['test:account-export-b102-binding'],
    /test-account-export-b102-completion-binding\.test\.mjs/u);
  assert.match(ops, /## B102/u);
  assert.match(ops, /#353 HOLD/u);
  assert.match(runtime, /STUDY_PROGRESS_ENABLED must remain false in production/u);
});
console.log('B102 completion destination binding: ' + passed + '/8 guards PASS');
