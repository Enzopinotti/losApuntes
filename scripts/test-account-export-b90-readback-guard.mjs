import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const base = 'apps/api/src/data-lifecycle/';
const helper = read(base + 'domain/account-export-artifact-readback.ts');
const storage = read(base + 'storage/account-export-artifact-storage.ts');
const jest = read(base + 'storage/account-export-artifact-storage.spec.ts');
const mongo = read('apps/api/src/study-progress/mongo/study-progress.mongo-int.spec.ts');
const processor = read(base + 'domain/account-export-processor.ts');
const pkg = JSON.parse(read('package.json'));
const ops = read('docs/operations/account-export-artifacts.md');
let n = 0;
function check(k, f) { f(); console.log('PASS ' + k); n++; }

check('B90 streaming hash implementation, no full-object buffering', () => {
  assert.match(helper, /for await \(const chunk of chunks\)/u);
  assert.match(helper, /digest\.update\(chunk\)/u);
  assert.doesNotMatch(helper, /Buffer\.concat\(/u);
});
check('B90 bounded bytes before updating digest, fail-closed', () => {
  assert.match(helper, /chunk\.byteLength > expected\.byteLength - bytesRead/u);
  assert.match(helper, /S3 readback exceeds expected byte length/u);
  assert.match(helper, /S3 readback byte length mismatch/u);
  assert.match(helper, /chunk instanceof Uint8Array/u);
});
check('B90 digest is verified with constant-time comparison', () => {
  assert.match(helper, /timingSafeEqual\(storedHash, expectedHash\)/u);
  assert.ok(helper.includes('!/^[a-f0-9]{64}$/u.test(expected.sha256)'));
});
check('B90 writer completion precedes readback which precedes published sink state', () => {
  const body = storage.slice(storage.indexOf('async commit('),
    storage.indexOf('async abort('));
  const put = body.indexOf('await writer.complete()');
  const readback = body.indexOf('await verifyAccountExportStoredBytes(');
  const published = body.indexOf("state = 'committed'");
  assert.ok(put >= 0 && readback > put && published > readback);
  assert.match(body, /storage\.readObjectChunks\(key\)/u);
});
check('B90 maintains original JSON result metadata guard', () => {
  assert.match(storage, /result\.byteLength !== byteLength/u);
  assert.match(storage, /result\.sha256 !== actualDigest/u);
  assert.match(storage, /accountExportSectionIds\(result\.formatVersion\)/u);
});
check('B90 private writer still opts out of direct object deletion on abort', () => {
  assert.match(storage, /deleteObjectOnAbort: false/u);
  assert.doesNotMatch(storage.slice(storage.indexOf('async commit('),
    storage.indexOf('async abort(')), /deleteArtifact\(/u);
});
check('B90 processor retains durable orphan queue with owner-fenced cleanup', () => {
  assert.match(processor, /enqueueAccountExportOrphanWithRetry/u);
  assert.match(processor, /fenceExpiredClaimForOrphanCleanup/u);
  assert.match(processor, /await this\.artifacts\.deleteArtifact\(/u);
});
check('B90 storage Jest rejects truncation, corruption and GET failure', () => {
  assert.match(jest, /B90 refuses a truncated S3 readback/u);
  assert.match(jest, /B90 refuses a same-length corrupt S3 readback/u);
  assert.match(jest, /B90 refuses a GET error/u);
});
check('B90 replica-set integration rejects S3 corruption and retains B80 writeahead', () => {
  assert.match(mongo, /B90 refuses to publish corrupt same-size S3 GET bytes/u);
  assert.match(mongo, /expect\(methods\)\.toEqual\(\['PUT', 'GET'\]\)/u);
  assert.match(mongo, /expect\(await orphanJobs\.countDocuments\(\{ jobId: id, generation \}\)\)\.toBe\(\s*1,?\s*\)/u);
});
check('B90 previous B86 published case now includes a GET verification', () => {
  const start = mongo.indexOf('B86 preserves a published generation');
  const end = mongo.indexOf('B90 refuses to publish corrupt', start);
  const section = mongo.slice(start, end);
  assert.match(section, /if \(method === 'GET'\)/u);
  assert.match(section, /expect\(httpMethods\)\.toEqual\(\['PUT', 'GET'\]\)/u);
});
check('B90 existing case proves lost PUT ACK does not request readback or DELETE', () => {
  assert.match(mongo, /expect\(httpMethods\)\.toEqual\(\['PUT', 'DELETE', 'DELETE'\]\)/u);
});
check('B90 executable suite and regression guard wired', () => {
  const chain = pkg.scripts['test:account-lifecycle-contract'];
  assert.match(chain, /test-account-export-b90-readback\.test\.mjs/u);
  assert.match(chain, /test-account-export-b90-readback-guard\.mjs/u);
});
check('B90 documentation keeps release HOLD explicit', () => {
  assert.match(ops, /B90/u);
  assert.match(ops, /#353 HOLD/u);
});
console.log('B90 private export stored-byte gate: ' + n + ' structural checks PASS');
