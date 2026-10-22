import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const loopback = read('scripts/test-account-export-b86-s3-loopback.test.mjs');
const acceptance = read('apps/api/src/study-progress/mongo/study-progress.mongo-int.spec.ts');
const runner = read('scripts/run-account-export-b86-local-acceptance.mjs');
const mongoUri = read('scripts/testing/b89-local-mongo-uri.mjs');
const plan = read('scripts/testing/b94-mongo-acceptance-plan.mjs');
const s3 = read('apps/api/src/files/storage/s3-object-storage.ts');
const adapter = read('apps/api/src/data-lifecycle/storage/account-export-artifact-storage.ts');
const processor = read('apps/api/src/data-lifecycle/domain/account-export-processor.ts');
const mongo = read('apps/api/src/data-lifecycle/mongo/mongo-account-export.store.ts');
const pkg = JSON.parse(read('package.json')).scripts;
const config = read('apps/api/src/config/runtime-environment.ts');
let count = 0;
function check(title, fn) { fn(); count++; console.log('PASS ' + title); }

check('B86 loopback uses real HTTP server, not a mocked fetch or remote endpoint', () => {
  assert.match(loopback, /createServer\(async \(request, response\) => \{/u);
  assert.match(loopback, /server\.listen\(0, '127\.0\.0\.1', resolve\)/u);
  assert.match(loopback, /createS3ObjectStorage\(\{/u);
  assert.doesNotMatch(loopback, /jest\.spyOn\(global/u);
});
check('B86 records provider requests with SigV4 and exact object scope', () => {
  assert.match(loopback, /request\.headers\.authorization/u);
  assert.match(loopback, /request\.headers\['x-amz-date'\]/u);
  assert.match(loopback, /assert\.equal\(url\.pathname, PATH/u);
});
check('B86 real HTTP tests cover successful signed readback and explicit deletion', () => {
  assert.match(loopback, /signed real HTTP PUT\/GET\/DELETE/u);
  assert.match(loopback, /storage\.readObjectChunks\(OBJECT_KEY\)/u);
  assert.match(loopback, /createHash\('sha256'\)/u);
});
check('B86 lost single PUT and multipart completion ACK preserve object after abort', () => {
  assert.match(loopback, /lost single PUT response preserves/u);
  assert.match(loopback, /lost multipart completion ACK aborts upload ID only/u);
  assert.match(loopback, /losePutAck/u);
  assert.match(loopback, /loseMultipartAck/u);
  assert.match(loopback, /deleteObjectOnAbort: false/u);
});
check('B86 provider 503 does not masquerade as successful cleanup', () => {
  assert.match(loopback, /failDelete: 1/u);
  assert.match(loopback, /assert\.rejects\(storage\.deleteObject\(OBJECT_KEY\), \/503\/u\)/u);
});
check('B86 retains legacy S3 abort behavior only for generic consumers', () => {
  assert.match(loopback, /shared generic writer keeps the previous explicit abort/u);
  assert.match(adapter, /deleteObjectOnAbort: false/u);
  assert.match(s3, /if \(input\.deleteObjectOnAbort !== false\)/u);
});
check('B86 Mongo opt-in uses real store, real private adapter and B80 ledger', () => {
  assert.match(acceptance, /B86 reconciles lost real S3 writer PUT ACK/u);
  assert.match(acceptance, /new MongoAccountExportStore\(exportJobs, users, connection, orphanJobs\)/u);
  assert.match(acceptance, /new S3AccountExportArtifactStorage\(s3\)/u);
  assert.match(acceptance, /queuedBeforeUpload/u);
  assert.match(mongo, /\$setOnInsert: writeAhead/u);
});
check('B86 Mongo opt-in proves transient S3 DELETE followed by durable retry and ACK', () => {
  assert.match(acceptance, /B86 S3 PUT ACK lost after object commit/u);
  assert.match(acceptance, /orphanRetries:\s*1,\s*orphanAuthorityBlocked:\s*0/u);
  assert.match(acceptance, /orphanDeleted:\s*1,\s*orphanRetries:\s*0/u);
  assert.match(acceptance, /expect\(httpMethods\)\.toEqual\(\['PUT', 'DELETE', 'DELETE'\]\)/u);
  assert.match(processor, /await this\.orphans\.renewLease\(/u);
});
check('B86 Mongo opt-in preserves durable published generation', () => {
  assert.match(acceptance, /B86 preserves a published generation/u);
  assert.match(acceptance, /orphanPreserved:\s*1,\s*orphanDeleted:\s*0/u);
  assert.match(acceptance, /artifactGeneration\)\.toBe\(\s*generation,?\s*\)/u);
  assert.match(acceptance, /httpMethods\)\.toEqual\(\['PUT', 'GET'\]\)/u);
});
check('B86 standalone guard delegates local URI to B89 and exact cases to B94', () => {
  assert.match(runner, /STUDY_PROGRESS_TEST_MONGO_URI/u);
  assert.match(runner, /validateB89LocalMongoUri\(uri\)/u);
  assert.match(mongoUri, /parsed\.protocol !== 'mongodb:'/u);
  assert.match(mongoUri, /parsed\.username \|\| parsed\.password/u);
  assert.match(mongoUri, /directConnection/u);
  assert.match(runner, /process\.versions\.node/u);
  assert.match(runner, /--testNamePattern', B94_MONGO_TEST_PATTERN/u);
  assert.match(runner, /verifyB94MongoAcceptanceReport\(report\)/u);
  assert.match(plan, /B94_MONGO_TEST_PATTERN/u);
  assert.match(runner, /--passWithNoTests=false/u);
});
check('B86 is wired into root lifecycle and kept opt-in for Mongo', () => {
  assert.match(pkg['test:account-lifecycle-contract'], /test-account-export-b86-s3-loopback\.test\.mjs/u);
  assert.match(pkg['test:account-lifecycle-contract'], /test-account-export-b86-guard\.mjs/u);
  assert.match(pkg['test:account-export-b86-local-acceptance'], /run-account-export-b86-local-acceptance\.mjs/u);
});
check('B86 retains HOLD and documents mocked-provider vs actual S3 limits', () => {
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
  assert.match(read('docs/operations/account-export-artifacts.md'), /B86/u);
});
console.log('B86 loopback S3 and real Mongo opt-in acceptance: ' + count + ' structural contracts PASS');
