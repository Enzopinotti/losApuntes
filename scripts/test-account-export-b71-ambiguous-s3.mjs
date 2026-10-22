import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const processor = read('apps/api/src/data-lifecycle/domain/account-export-processor.ts');
const tests = read('apps/api/src/data-lifecycle/domain/account-export-processor.spec.ts');
const mongo = read('apps/api/src/study-progress/mongo/study-progress.mongo-int.spec.ts');
const runner = read('scripts/accept-account-export-b70.mjs');
const config = read('apps/api/src/config/runtime-environment.ts');

const claim = processor.slice(
  processor.indexOf('  private async processClaim('),
  processor.indexOf('  private async isConfirmedCompletion('),
);
let passed = 0;
function check(name, validate) {
  validate();
  passed += 1;
  console.log('PASS ' + name);
}

check('failed S3 assembler abort is best-effort, not proof that committed object is absent', () => {
  assert.match(claim, /if \(!artifactCommitted\) \{/u);
  assert.match(claim, /await sink\.abort\(\)/u);
  assert.match(claim, /Multipart completion might have succeeded/u);
});
check('retry CAS must succeed before any cleanup of an ambiguous pre-completion S3 generation', () => {
  const reschedule = claim.indexOf('const updated = await this.exports.reschedule(');
  const casRejected = claim.indexOf('if (!updated)');
  const cleanup = claim.indexOf('await this.deleteOrEnqueueProvenOrphan(job, claimId, result);', casRejected);
  assert.ok(reschedule >= 0 && casRejected > reschedule && cleanup > casRejected);
  const tail = claim.slice(casRejected, cleanup);
  assert.match(tail, /return 'stale'/u);
});
check('every winning retry CAS removes the claim scoped attempt even if assembly never returned', () => {
  assert.match(claim, /await this.deleteOrEnqueueProvenOrphan\(job, claimId, result\);\s*return terminal \? 'failed' : 'retryScheduled';/u);
  assert.doesNotMatch(claim, /if \(uncertainCompletion\) \{\s*await this.deleteOrEnqueueProvenOrphan\(job, claimId\)/u);
});
check('lost lease before durable completion permits only attempt-scoped cleanup', () => {
  assert.match(claim, /if \(leaseLost\) \{\s*if \(!durableCompletionAttempted\) \{/u);
  assert.match(claim, /Once Mongo completion was attempted, preserve the S3 generation/u);
});
check('uncertain durable Mongo completion still gets exact-generation reconciliation', () => {
  assert.match(claim, /await this\.isConfirmedCompletion\(job, claimId, completedAssembly\)/u);
  assert.match(claim, /if \(uncertainCompletion && completedAssembly\)/u);
  assert.match(claim, /if \(!updated\)/u);
});
check('new Jest matrix covers lost multipart ACK and failed/unknown retry CAS', () => {
  assert.match(tests, /B71 queues S3 cleanup after multipart completion ACK is lost/u);
  assert.match(tests, /B71 preserves retry result when orphan enqueue fails/u);
  assert.match(tests, /B71 does not delete uncertain multipart generation when Mongo retry CAS loses/u);
  assert.match(tests, /B71 preserves S3 when Mongo retry CAS itself is unavailable/u);
  assert.match(tests, /B71 still queues cleanup after an abort error when a durable retry CAS wins/u);
});
check('new Mongo opt-in simulates S3 ACK loss, durable retry, crash recovery', () => {
  assert.match(mongo, /B71 recovers an ambiguous S3 multipart completion with real Mongo retry CAS/u);
  assert.match(mongo, /S3 multipart ACK lost/u);
  assert.match(mongo, /S3 DELETE transient outage/u);
  assert.match(mongo, /new MongoAccountExportOrphanCleanupStore\(orphanJobs\)/u);
});
check('B70 local runner includes focused processor and Mongo acceptance suites', () => {
  assert.match(runner, /account-export-processor\.spec\.ts/u);
  assert.match(runner, /study-progress\.mongo-int\.spec\.ts/u);
  assert.match(runner, /productionRelease: 'HOLD'/u);
});
check('production feature remains disabled pending real S3 and Mongo evidence', () => {
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
});
console.log('B71 ambiguous S3 commit: ' + passed + ' structural contracts PASS');
