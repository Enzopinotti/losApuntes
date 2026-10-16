import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const root = 'apps/api/src/data-lifecycle/';
const takeover = source(root + 'mongo/mongo-account-export.store.ts');
const queue = source(root + 'mongo/mongo-account-export-orphan-cleanup.store.ts');
const schema = source(root + 'mongo/account-export-orphan-cleanup.schema.ts');
const contract = source(root + 'domain/account-export-orphan-cleanup.store.ts');
const processor = source(root + 'domain/account-export-processor.ts');
const tests = source(root + 'domain/account-export-processor.spec.ts');
const mongo = source('apps/api/src/study-progress/mongo/study-progress.mongo-int.spec.ts');
const logger = source(root + 'account-export.worker.ts');
const config = source('apps/api/src/config/runtime-environment.ts');

const reclaim = takeover.slice(takeover.indexOf('  async claimNext('),
  takeover.indexOf('  async renewLease('));
const drain = processor.slice(processor.indexOf('  private async drainOrphanCleanup('),
  processor.indexOf('  private async deleteExpiredArtifacts('));
const ack = queue.slice(queue.indexOf('  async acknowledge('),
  queue.indexOf('  async retry('));
const clear = queue.slice(queue.indexOf('  async clearPending('),
  queue.indexOf('  async claimNext('));
let checks = 0;
function verify(name, fn) {
  fn();
  checks += 1;
  console.log('PASS ' + name);
}

verify('takeover persists a one-hour re-verification horizon', () => {
  assert.match(reclaim, /const verificationUntil = new Date\(/u);
  assert.match(reclaim, /input\.now\.getTime\(\) \+ 60 \* 60_000/u);
  assert.match(reclaim, /verificationUntil,/u);
  assert.match(reclaim, /\{ upsert: true, session \}/u);
});
verify('existing intents gain a monotonic horizon and delayed pending schedule', () => {
  assert.match(reclaim, /\$max: \{ verificationUntil \}/u);
  assert.match(reclaim, /\$max: \{ nextAttemptAt: settleAt \}/u);
  assert.match(reclaim, /state: 'pending'/u);
  assert.match(reclaim, /\{ session \}/u);
});
verify('horizon is durable and carried through claimed task records', () => {
  assert.match(schema, /verificationUntil!: Date \| null/u);
  assert.match(schema, /@Prop\(\{ type: Date, default: null \}\)/u);
  assert.match(contract, /verificationUntil\?: Date \| null/u);
});
verify('old worker cannot clear a pending takeover ledger', () => {
  assert.match(clear, /state: 'pending'/u);
  assert.match(clear, /claimId: null/u);
  assert.match(clear, /verificationUntil: null/u);
});
verify('ACK is fenced to exact horizon to block late takeover changes', () => {
  assert.match(ack, /verificationUntil: input\.verificationUntil \?\? null/u);
  assert.match(ack, /claimId: input\.claimId/u);
  assert.match(ack, /leaseExpiresAt: \{ \$gt: input\.now \}/u);
});
verify('invalid verification deadline is rejected before any S3 delete', () => {
  const rejection = drain.indexOf('Account export cleanup verification deadline is invalid');
  const remove = drain.indexOf('this.artifacts.deleteArtifact(');
  assert.ok(rejection > 0 && remove > rejection);
});
verify('each verification pass rechecks owner and referenced generation', () => {
  assert.match(drain, /findForOrphanCleanup\(candidate\.jobId\)/u);
  assert.match(drain, /job\.userId !== candidate\.ownerUserId/u);
  assert.match(drain, /job\.artifactGeneration === candidate\.generation/u);
  assert.match(drain, /this\.orphans\.renewLease\(/u);
});
verify('successful early DELETE persists a delayed retry instead of ACK', () => {
  const afterS3 = drain.slice(drain.indexOf('const verifiedAt = new Date();'));
  assert.match(afterS3, /verifiedAt\.getTime\(\) \+ 10 \* 60_000/u);
  assert.match(afterS3, /candidate\.verificationUntil\.getTime\(\)/u);
  assert.match(afterS3, /await this\.orphans\.retry\(/u);
  assert.match(afterS3, /result\.orphanVerificationScheduled \+= 1/u);
  assert.ok(afterS3.indexOf('await this.orphans.retry(') <
    afterS3.indexOf('await this.orphans.acknowledge('));
});
verify('last verification pass ACKs only its exact claimed horizon', () => {
  assert.match(drain, /verificationUntil: candidate\.verificationUntil/u);
  assert.match(drain, /if \(acked\) result\.orphanDeleted \+= 1/u);
});
verify('unit tests cover early, final, invalid, failed retry and re-referenced generations', () => {
  assert.match(tests, /B75 retains an orphan after a successful S3 DELETE/u);
  assert.match(tests, /B75 performs a final exact generation DELETE/u);
  assert.match(tests, /B75 never deletes when verification deadline is malformed/u);
  assert.match(tests, /B75 does not ACK a verification task/u);
  assert.match(tests, /B75 protects a re-referenced generation/u);
});
verify('real Mongo opt-in includes restart and CAS race with existing cleanup claim', () => {
  assert.match(mongo, /B75 prevents a pre-takeover cleanup claimant from ACKing/u);
  assert.match(mongo, /B75 prevents the old worker fast path from cancelling/u);
  assert.match(mongo, /orphanVerificationScheduled: 1/u);
  assert.match(mongo, /const restarted = new AccountExportProcessor/u);
});
verify('observability and production feature gate preserved', () => {
  assert.match(logger, /iteration\.orphanVerificationScheduled > 0/u);
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
});
console.log('B75 late S3 commit reverification: ' + checks + ' structural safeguards PASS');
