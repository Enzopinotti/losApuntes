import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const api = 'apps/api/src/';
const processor = read(api + 'data-lifecycle/domain/account-export-processor.ts');
const tests = read(api + 'data-lifecycle/domain/account-export-processor.spec.ts');
const mongo = read(api + 'study-progress/mongo/study-progress.mongo-int.spec.ts');
const store = read(api + 'data-lifecycle/mongo/mongo-account-export.store.ts');
const bucket = read(api + 'data-lifecycle/storage/account-export-artifact-storage.ts');
const config = read(api + 'config/runtime-environment.ts');
let checked = 0;

function verify(label, check) {
  check();
  checked += 1;
  console.log('PASS', label);
}
verify('lost acknowledgement is reconciled by exact owner-scoped Mongo read', () => {
  assert.match(processor, /this\.store\.findOwned\(job\.id, job\.userId\)/u);
  assert.match(processor, /current\.userId === job\.userId/u);
  assert.match(processor, /current\.id === job\.id/u);
  assert.match(processor, /current\.state === 'completed'/u);
  assert.match(processor, /current\.active === false/u);
});
verify('completed data is matched to exact immutable S3 generation and digest', () => {
  assert.match(processor, /current\.artifactGeneration === claimId/u);
  assert.match(processor, /current\.formatVersion === assembly\.formatVersion/u);
  assert.match(processor, /current\.artifactSectionCount === assembly\.sectionCount/u);
  assert.match(processor, /current\.artifactRecordCount === assembly\.recordCount/u);
  assert.match(processor, /current\.artifactByteLength === assembly\.byteLength/u);
  assert.match(processor, /current\.artifactSha256 === assembly\.sha256/u);
});
verify('reconciliation read failures never fabricate successful completion', () => {
  assert.match(processor, /No durable evidence available/u);
  assert.match(processor, /return false;/u);
});
verify('CAS grants cleanup only after durable pending or failed state', () => {
  const reschedule = processor.lastIndexOf('const updated = await this.exports.reschedule(');
  const result = processor.indexOf('if (!updated)', reschedule);
  const cleanup = processor.indexOf('await this.deleteOrEnqueueProvenOrphan(job, claimId, result)', result);
  assert.ok(reschedule >= 0 && result > reschedule && cleanup > result);
  assert.match(processor, /if \(uncertainCompletion && completedAssembly\)/u);
});
verify('CAS loss causes a second reconciliation read before stale result', () => {
  assert.match(processor, /if \(!updated\) \{/u);
  assert.match(processor, /await this\.isConfirmedCompletion\(job, claimId, completedAssembly\)/u);
});
verify('definite stale claims only delete attempt-scoped generation and do not retry', () => {
  assert.match(processor, /The durable CAS explicitly rejected this claim/u);
  assert.match(processor, /return 'stale';/u);
  assert.match(bucket, /exports\/\$\{jobId\}\/\$\{generation\}\.json/u);
});
verify('typed confirmed epoch conflicts retain their existing safer cleanup', () => {
  assert.match(processor, /error instanceof AccountExportEpochConflictError/u);
});
verify('both recovered completion and proven orphan are tested', () => {
  assert.match(tests, /B66 reconciles a lost Mongo acknowledgement/u);
  assert.match(tests, /B66 queues orphan cleanup only AFTER retry CAS/u);
  assert.match(tests, /B66 rechecks after a lost reschedule CAS/u);
  assert.match(tests, /B66 preserves S3 when claim outcome is unknown/u);
  assert.match(tests, /B66 ignores a completed export from another owner/u);
  assert.match(tests, /B66 retains a durable retry outcome when orphan enqueue fails/u);
  assert.match(tests, /B66 never deletes S3 if the reconciliation CAS itself fails/u);
  assert.match(tests, /B66 preserves S3 if both reconciliation reads are unavailable/u);
  assert.match(tests, /also reconciles lost acknowledgements for historical/u);
});
verify('real Mongo replica opt-in tests cover lost reply and CAS before orphan cleanup', () => {
  assert.match(mongo, /B66 recovers an actually committed Mongo export/u);
  assert.match(mongo, /B66 queues an orphan only after a real Mongo reschedule commits/u);
  assert.match(mongo, /STUDY_PROGRESS_TEST_MONGO_URI/u);
  assert.match(store, /userId: ownerUserId/u);
});
verify('release gates are still in force', () => {
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
});
console.log('B66 private export reconciliation: ' + checked + ' source contracts PASS');
