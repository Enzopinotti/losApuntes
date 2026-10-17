import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const parser = read('apps/api/src/files/storage/s3-multipart-completion.ts');
const writer = read('apps/api/src/files/storage/s3-object-storage.ts');
const nodeTest = read('scripts/test-account-export-b103-confirmation-etag.test.mjs');
const http = read('scripts/test-account-export-b86-s3-loopback.test.mjs');
const jest = read('apps/api/src/files/storage/s3-object-storage.spec.ts');
const b96 = read('scripts/test-account-export-b96-multipart-response.test.mjs');
const b99 = read('scripts/test-account-export-b99-multipart-xml.test.mjs');
const b102 = read('scripts/test-account-export-b102-completion-binding.test.mjs');
const scripts = JSON.parse(read('package.json')).scripts;
const config = read('apps/api/src/config/runtime-environment.ts');
const ops = read('docs/operations/account-export-artifacts.md');
let count = 0;
function check(name, fn) { fn(); count++; console.log('PASS ' + name); }

check('B103 no longer confirms root-only S3 HTTP 200 responses', () => {
  assert.match(parser, /if \(tag\.selfClosing\) return false/u);
  assert.doesNotMatch(parser, /if \(tag\.selfClosing\) return index === body\.length/u);
  assert.match(nodeTest, /selfclosing HTTP 200 result never confirms multipart completion/u);
});
check('B103 requires a meaningful decoded ETag before committing a multipart writer', () => {
  assert.match(parser, /decodeCompletionXmlField\(fieldText\)\.trim\(\)\.length === 0/u);
  assert.match(parser, /etagSeen = true/u);
  assert.match(nodeTest, /decoded XML whitespace cannot masquerade/u);
});
check('B103 retains strict bounded read and B102 bucket/key destination binding', () => {
  const complete = writer.slice(
    writer.indexOf('async complete(): Promise<void>'),
    writer.indexOf('async abort(): Promise<void>'),
  );
  const readAt = complete.indexOf('readBoundedS3MultipartCompletionXml(response)');
  const confirmAt = complete.indexOf('isConfirmedS3MultipartCompletion(xml, {');
  const doneAt = complete.lastIndexOf('completed = true;');
  assert.ok(readAt >= 0 && confirmAt > readAt && doneAt > confirmAt);
  assert.match(parser, /responseBucket === expected\.bucket/u);
  assert.match(parser, /responseKey === expected\.objectKey/u);
});
check('B103 the B86 signed localhost provider now returns a complete real-looking ACK', () => {
  assert.match(http, /input\.completeMultipartBody \?\?/u);
  assert.match(http, /<ETag>"fixture-etag"<\/ETag>/u);
  assert.match(http, /<Bucket>\$\{BUCKET\}<\/Bucket>/u);
  assert.match(http, /<Key>\$\{OBJECT_KEY\}<\/Key>/u);
});
check('B103 tests HTTP 200 incomplete completion with owner-safe cleanup', () => {
  assert.match(http, /B103 signed HTTP refuses empty success ACK/u);
  assert.match(http, /provider committed bytes despite ambiguous ACK/u);
  assert.match(http, /private object requires owner-fenced cleanup/u);
  assert.match(jest, /B103 rejects HTTP 200 without a meaningful ETag/u);
  assert.match(jest, /deleteObjectOnAbort: false/u);
});
check('B103 updates B96 B99 B102 compatibility tests to reject legacy empty ACK', () => {
  assert.match(b96, /rejects the known self-closing local/u);
  assert.match(b99, /rejects legacy empty ACK/u);
  assert.match(b102, /rejects B86 legacy empty ACK/u);
  assert.match(nodeTest, /real ETag confirms the completion envelope/u);
});
check('B103 preserves source guards and standalone executable lifecycle scripts', () => {
  const chain = scripts['test:account-lifecycle-contract'];
  for (const id of [
    'b86-s3-loopback', 'b96-multipart-response', 'b97-bounded-multipart',
    'b99-multipart-xml', 'b100-s3-initiation', 'b101-loader',
    'b102-completion-binding', 'b103-confirmation-etag',
  ]) assert.ok(chain.includes(id), id);
  assert.match(scripts['test:account-export-b103-etag'],
    /test-account-export-b103-confirmation-etag\.test\.mjs/u);
});
check('B103 cannot prematurely release private Study data', () => {
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
  assert.match(writer, /input\.deleteObjectOnAbort !== false/u);
  assert.match(ops, /## B103/u);
  assert.match(ops, /#353 HOLD/u);
});
console.log('B103 strict S3 completion acknowledgement: ' + count + '/8 guards PASS');
