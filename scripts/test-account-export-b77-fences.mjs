import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const path = 'apps/api/src/data-lifecycle/';
const queue = read(path + 'mongo/mongo-account-export-orphan-cleanup.store.ts');
const contract = read(path + 'domain/account-export-orphan-cleanup.store.ts');
const takeover = read(path + 'mongo/mongo-account-export.store.ts');
const processor = read(path + 'domain/account-export-processor.ts');
const queueTests = read(path + 'mongo/mongo-account-export-orphan-cleanup.store.spec.ts');
const processorTests = read(path + 'domain/account-export-processor.spec.ts');
const mongoTests = read('apps/api/src/study-progress/mongo/study-progress.mongo-int.spec.ts');
const ops = read('docs/operations/account-export-artifacts.md');
const config = read('apps/api/src/config/runtime-environment.ts');
const claim = queue.slice(queue.indexOf('  async claimNext('), queue.indexOf('  async renewLease('));
const renew = queue.slice(queue.indexOf('  async renewLease('), queue.indexOf('  async acknowledge('));
const retry = queue.slice(queue.indexOf('  async retry('));
const reclaim = takeover.slice(takeover.indexOf('  async claimNext('), takeover.indexOf('  async renewLease('));
const drain = processor.slice(processor.indexOf('  private async drainOrphanCleanup('), processor.indexOf('  private async deleteExpiredArtifacts('));
let count = 0;
function verify(label, check) { check(); count++; console.log('PASS ' + label); }

verify('processing lease recovery requires BOTH expired lease and due date', () => {
  assert.match(claim, /state: 'processing'/u);
  assert.match(claim, /leaseExpiresAt: \{ \$lte: input\.now \}/u);
  assert.match(claim, /nextAttemptAt: \{ \$lte: input\.now \}/u);
});
verify('ordinary pending tasks retain the same due fence', () => {
  assert.match(claim, /state: 'pending', nextAttemptAt: \{ \$lte: input\.now \}/u);
});
verify('takeover extends waiting period without stealing an existing claim', () => {
  assert.match(reclaim, /\$max: \{ nextAttemptAt: settleAt \}/u);
  const part = reclaim.slice(reclaim.indexOf('this.orphanCleanup!.updateOne('),
    reclaim.indexOf('// Use the original _id returned by the atomic takeover'));
  assert.match(part, /jobId: previous\.id, generation: oldGeneration/u);
  assert.doesNotMatch(part, /\$set: \{[^}]*claimId:/u);
});
verify('renewal CAS protects the originally observed verification horizon', () => {
  assert.match(renew, /verificationUntil: input\.verificationUntil \?\? null/u);
  assert.match(renew, /leaseExpiresAt: \{ \$gt: input\.now \}/u);
  assert.match(contract, /verificationUntil\?: Date \| null/u);
});
verify('failure retry CAS also protects the originally observed horizon', () => {
  assert.match(retry, /verificationUntil: input\.verificationUntil \?\? null/u);
  assert.match(retry, /claimId: input\.claimId/u);
  assert.match(retry, /state: 'processing'/u);
});
verify('retry updates are monotonic and cannot shorten a takeover settlement', () => {
  assert.match(retry, /\$max: \{ nextAttemptAt: input\.nextAttemptAt \}/u);
  assert.doesNotMatch(retry, /\$set: \{[^}]*nextAttemptAt/u);
});
verify('worker uses a shared captured horizon fence on renew/retry/ACK', () => {
  assert.match(drain, /const fence = \{/u);
  assert.match(drain, /verificationUntil: candidate\.verificationUntil \?\? null/u);
  assert.match(drain, /const owned = await this\.orphans\.renewLease\(\{\s*\.\.\.fence/u);
  assert.match(drain, /renewalInFlight = this\.orphans\s*\.renewLease\(\{\s*\.\.\.fence/u);
  assert.match(drain, /const deferred = await this\.orphans\.retry\(\{\s*\.\.\.fence/u);
});
verify('worker carries fence on failure backoff and final ACK', () => {
  assert.match(drain, /this\.orphans\.retry\(\{\s*\.\.\.fence,\s*now: new Date\(\)/u);
  assert.match(drain, /this\.orphans\.acknowledge\(\{\s*\.\.\.fence/u);
});
verify('unit Jest tests cover due, stale renew and retry and captured processor horizon', () => {
  assert.match(queueTests, /B77 rejects a reclaimed processing task/u);
  assert.match(queueTests, /B77 lease renewal requires the claimant/u);
  assert.match(queueTests, /B77 fails a stale deadline on retry/u);
  assert.match(processorTests, /B77 blocks S3 DELETE when a takeover invalidates cleanup lease renewal/u);
  assert.match(processorTests, /B77 keeps the captured horizon on provider failure/u);
});
verify('Mongo integration covers crash takeover settlement and stale claimant', () => {
  assert.match(mongoTests, /B77 keeps an expired cleanup lease blocked until its new settlement date/u);
  assert.match(mongoTests, /B77 refuses stale claimant renew\/retry/u);
});
verify('production feature remains blocked', () => {
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
});
verify('operations runbook names B77 handoff protection', () => {
  assert.match(ops, /B77/u);
});
console.log('B77 takeover settlement fences: ' + count + ' structural contracts PASS');
