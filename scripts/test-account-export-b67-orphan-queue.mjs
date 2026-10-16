import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const source = (file) => readFileSync(new URL(file, root), 'utf8');
const dir = 'apps/api/src/data-lifecycle/';
const schema = source(dir + 'mongo/account-export-orphan-cleanup.schema.ts');
const mongo = source(dir + 'mongo/mongo-account-export-orphan-cleanup.store.ts');
const store = source(dir + 'domain/account-export-orphan-cleanup.store.ts');
const worker = source(dir + 'domain/account-export-processor.ts');
const tests = source(dir + 'domain/account-export-processor.spec.ts');
const module = source(dir + 'data-lifecycle.module.ts');
const workerBootstrap = source(dir + 'account-export.worker.ts');
const testMongo = source('apps/api/src/study-progress/mongo/study-progress.mongo-int.spec.ts');
const config = source('apps/api/src/config/runtime-environment.ts');
let count = 0;

function verify(description, check) {
  check();
  count += 1;
  console.log('PASS', description);
}
verify('durable queue has exact unique generation key', () => {
  assert.match(schema, /jobId: 1, generation: 1/u);
  assert.match(schema, /unique: true/u);
  assert.match(schema, /leaseExpiresAt/u);
});
verify('only one task is persisted and existing claims cannot be reset', () => {
  assert.match(mongo, /\$setOnInsert/u);
  assert.match(mongo, /\{ upsert: true \}/u);
  assert.match(mongo, /duplicateKey\(error\)/u);
});
verify('queue identity is validated against S3 object-key UUID requirements', () => {
  assert.match(mongo, /function validId/u);
  assert.match(mongo, /!validId\(input\.generation\)/u);
  assert.match(mongo, /!validId\(input\.jobId\)/u);
});
verify('worker claims pending due rows or processing rows with both due and expired lease', () => {
  assert.match(mongo, /state: 'pending', nextAttemptAt: \{ \$lte: input\.now \}/u);
  const claim = mongo.slice(mongo.indexOf('  async claimNext('),
    mongo.indexOf('  async renewLease('));
  assert.match(claim, /state: 'processing',[\s\S]*?leaseExpiresAt: \{ \$lte: input\.now \},[\s\S]*?nextAttemptAt: \{ \$lte: input\.now \}/u);
  assert.match(mongo, /\$inc: \{ attempts: 1 \}/u);
});
verify('cleanup acknowledgement and retry are fenced by exact claim lease', () => {
  assert.match(mongo, /leaseExpiresAt: \{ \$gt: input\.now \}/u);
  assert.match(mongo, /deleteOne\(/u);
  assert.match(mongo, /nextAttemptAt: input\.nextAttemptAt/u);
});
verify('orphan cleanup is a separate dependency wired by Nest', () => {
  assert.match(store, /ACCOUNT_EXPORT_ORPHAN_CLEANUP_STORE/u);
  assert.match(module, /MongoAccountExportOrphanCleanupStore/u);
  assert.match(module, /AccountExportOrphanCleanupSchema/u);
  assert.match(module, /useExisting: MongoAccountExportOrphanCleanupStore/u);
});
verify('no deletion before confirming generation is not referenced', () => {
  const drain = worker.slice(worker.indexOf('  private async drainOrphanCleanup('));
  const find = drain.indexOf('this.store.findForOrphanCleanup(candidate.jobId)');
  const guard = drain.indexOf('job.artifactGeneration === candidate.generation');
  const active = drain.indexOf("job.state === 'processing'");
  const remove = drain.indexOf('this.artifacts.deleteArtifact(');
  assert.ok(find >= 0 && guard > find && active > guard && remove > active);
  assert.match(drain, /job\.artifactGeneration === candidate\.generation/u);
  assert.match(drain, /job\.userId !== candidate\.ownerUserId/u);
  assert.match(drain, /await this\.orphans\.renewLease\(/u);
});
verify('only proven orphan deletion failures are queued', () => {
  assert.match(worker, /deleteOrEnqueueProvenOrphan\(/u);
  assert.match(worker, /await this\.orphans\.enqueue\(/u);
  assert.match(worker, /uncertainCompletion/u);
  assert.doesNotMatch(worker, /if \(uncertainCompletion\) \{\s*await this\.orphans\.enqueue/u);
});
verify('bounded retries and restart-safe claims do not exhaust permanently', () => {
  assert.match(worker, /ORPHAN_BATCH_SIZE = 10/u);
  assert.match(worker, /ORPHAN_MAX_BACKOFF_MS/u);
  assert.match(worker, /await this\.orphans\.retry\(/u);
  assert.match(worker, /await this\.orphans\.acknowledge\(/u);
});
verify('worker emits counters even without new exports', () => {
  assert.match(workerBootstrap, /iteration\.orphanDeleted > 0/u);
  assert.match(workerBootstrap, /iteration\.orphanPreserved > 0/u);
  assert.match(workerBootstrap, /iteration\.orphanRetries > 0/u);
});
verify('unit and opt-in Mongo tests cover completed references and worker restarts', () => {
  assert.match(tests, /B67 preserves a generation referenced by a completed job/u);
  assert.match(tests, /B67 waits for a still-live matching claim/u);
  assert.match(testMongo, /B67 retains an orphan cleanup task across a crashed worker lease/u);
  assert.match(testMongo, /B67 retries a failed deletion without losing a durable orphan record/u);
});
verify('production progress remains release blocked', () => {
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
});
console.log('B67 export cleanup: ' + count + ' source contracts PASS');
