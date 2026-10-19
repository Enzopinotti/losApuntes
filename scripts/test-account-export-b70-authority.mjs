import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const prefix = 'apps/api/src/data-lifecycle/';
const processor = source(prefix + 'domain/account-export-processor.ts');
const tests = source(prefix + 'domain/account-export-processor.spec.ts');
const mongo = source('apps/api/src/study-progress/mongo/study-progress.mongo-int.spec.ts');
const exports = source(prefix + 'mongo/mongo-account-export.store.ts');
const logging = source(prefix + 'account-export.worker.ts');
const runner = source('scripts/accept-account-export-b70.mjs');
const releaseConfig = source('apps/api/src/config/runtime-environment.ts');

const drain = processor.slice(
  processor.indexOf('  private async drainOrphanCleanup('),
  processor.indexOf('  private async deleteExpiredArtifacts('),
);
let passed = 0;
const verify = (label, predicate) => {
  predicate();
  passed++;
  console.log('PASS ' + label);
};

verify('orphan deletion requires non-null durable job authority', () => {
  const lookup = drain.indexOf('findForOrphanCleanup(candidate.jobId)');
  const reject = drain.indexOf('if (!job)');
  const deleteArtifact = drain.indexOf('this.artifacts.deleteArtifact(');
  assert.ok(lookup >= 0 && reject > lookup && deleteArtifact > reject);
  assert.match(drain, /Export orphan cleanup authority is missing/u);
});
verify('mismatched job and owner both fail closed', () => {
  assert.match(drain, /job\.id !== candidate\.jobId/u);
  assert.match(drain, /job\.userId !== candidate\.ownerUserId/u);
  assert.match(drain, /Export orphan cleanup authority mismatch/u);
});
verify('any durable referenced artifact is preserved irrespective of job state', () => {
  assert.match(drain, /if \(job\.artifactGeneration === candidate\.generation\) \{/u);
  const guardStart = drain.indexOf('if (job.artifactGeneration === candidate.generation)');
  const guardEnd = drain.search(/if\s*\(\s*job\.state === 'processing'/u);
  assert.ok(guardStart >= 0 && guardEnd > guardStart);
  const guard = drain.slice(guardStart, guardEnd);
  assert.match(guard, /this\.orphans\.acknowledge/u);
  assert.doesNotMatch(guard, /job\.state === 'completed'/u);
  assert.doesNotMatch(guard, /this\.artifacts\.deleteArtifact/u);
});
verify('an active claim is still retained and CAS fenced before S3', () => {
  assert.match(drain, /job\.claimId === candidate\.generation/u);
  assert.match(drain, /const owned = await this\.orphans\.renewLease\(/u);
  assert.ok(drain.indexOf('const owned = await this.orphans.renewLease(') <
    drain.indexOf('this.artifacts.deleteArtifact('));
});
verify('missing/mismatch authority is counted without exposing identifying fields', () => {
  assert.match(processor, /orphanAuthorityBlocked: number/u);
  assert.match(processor, /orphanAuthorityBlocked: 0/u);
  assert.equal((drain.match(/orphanAuthorityBlocked \+= 1/gu) || []).length, 3); // missing job, foreign owner, revoked claim CAS
  assert.match(logging, /iteration\.orphanAuthorityBlocked > 0/u);
  assert.match(logging, /\.\.\.iteration/u);
});
verify('unit tests model missing authority and malformed referenced states', () => {
  assert.match(tests, /B70 fails closed when the durable job is missing/u);
  assert.match(tests, /B70 does not infer absence after an unavailable durable authority read/u);
  assert.match(tests, /B70 preserves a generation referenced by an inconsistent/u);
  assert.match(tests, /B70 refuses a queue row pointing at a different durable job ID/u);
});
verify('Jest B68 tests still have durable pending-job fixture', () => {
  assert.match(tests, /findForOrphanCleanup: jest\.fn\(\)\.mockResolvedValue\(\s*claim\(/u);
  assert.doesNotMatch(tests, /findForOrphanCleanup: jest\.fn\(\)\.mockResolvedValue\(null\)/u);
});
verify('real local Mongo acceptance includes missing and still-referenced job', () => {
  assert.match(mongo, /B70 keeps an orphan task but never touches S3 when the durable job is missing/u);
  assert.match(mongo, /B70 preserves a referenced generation even if durable job state is nonterminal/u);
});
verify('authoritative Mongo job read by ID remains in force', () => {
  assert.match(exports, /async findForOrphanCleanup\(\s*id: string,?\s*\)/u);
  assert.match(exports, /\.findOne\(\{ id \}\)/u);
});
verify('exact-head acceptance refuses remote Mongo and records incomplete release gates', () => {
  assert.match(runner, /--expected-sha/u);
  assert.match(runner, /STUDY_PROGRESS_TEST_MONGO_URI/u);
  assert.match(runner, /safeHosts\.has\(mongo\.hostname\)/u);
  assert.match(runner, /actualS3ProviderAcceptance: 'NOT_RUN'/u);
  assert.match(runner, /productionRelease: 'HOLD'/u);
});
verify('production feature remains blocked', () => {
  assert.match(releaseConfig, /STUDY_PROGRESS_ENABLED must remain false in production/u);
});
console.log('B70 export authority: ' + passed + ' static safeguards PASS');
