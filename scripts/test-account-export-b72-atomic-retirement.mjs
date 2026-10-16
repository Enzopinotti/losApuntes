import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const dir = 'apps/api/src/data-lifecycle/';
const processor = read(dir + 'domain/account-export-processor.ts');
const contract = read(dir + 'domain/account-export.store.ts');
const mongo = read(dir + 'mongo/mongo-account-export.store.ts');
const mongoUnit = read(dir + 'mongo/mongo-account-export.store.spec.ts');
const processorUnit = read(dir + 'domain/account-export-processor.spec.ts');
const integration = read('apps/api/src/study-progress/mongo/study-progress.mongo-int.spec.ts');
const telemetry = read(dir + 'account-export.worker.ts');
const config = read('apps/api/src/config/runtime-environment.ts');

let passed = 0;
function verify(label, predicate) {
  predicate();
  passed += 1;
  console.log('PASS ' + label);
}
const retire = processor.slice(processor.indexOf('  private async deleteExpiredArtifacts('));
const txn = mongo.slice(mongo.indexOf('  async retireExpiredArtifact('),
  mongo.indexOf('  async hasFailed('));

verify('expiry no longer directly calls any S3 DELETE or best-effort clear', () => {
  assert.doesNotMatch(retire, /this\.artifacts\.deleteArtifact/u);
  assert.doesNotMatch(retire, /clearExpiredArtifact/u);
  assert.match(retire, /this\.store\.retireExpiredArtifact\(/u);
});
verify('an expiry cursor-read outage does not block new export claims', () => {
  assert.match(retire, /try \{[\s\S]*?findExpiredArtifacts/u);
  assert.match(retire, /result\.expirationRetries \+= 1;\s*return;/u);
});
verify('retirement contract demands atomic detach and durable queue insertion', () => {
  assert.match(contract, /retireExpiredArtifact\(input:/u);
  assert.doesNotMatch(contract, /clearExpiredArtifact\(input:/u);
  assert.match(txn, /await session\.withTransaction\(async \(\) => \{/u);
  assert.match(txn, /retired = false;/u);
});
verify('Mongo CAS guards exact ID generation expiry and completed state', () => {
  assert.match(txn, /id: input\.id/u);
  assert.match(txn, /state: 'completed'/u);
  assert.match(txn, /artifactGeneration: input\.generation/u);
  assert.match(txn, /\$eq: input\.expiresAt/u);
  assert.match(txn, /\$lte: input\.now/u);
  assert.match(txn, /\$set: \{ artifactGeneration: null \}/u);
});
verify('owner comes from the durable previous job, never a queue-supplied hint', () => {
  assert.match(txn, /ownerUserId: previous\.userId/u);
  assert.match(txn, /previous\.artifactGeneration !== input\.generation/u);
});
verify('queue upsert shares same Mongo session as atomic unlink', () => {
  const link = txn.indexOf('.findOneAndUpdate(');
  const enqueue = txn.indexOf('this.orphanCleanup!.updateOne(');
  assert.ok(link >= 0 && enqueue > link);
  assert.match(txn, /\{ upsert: true, session \}/u);
  assert.match(txn, /\{ session, new: false \}/u);
  assert.match(txn, /\$setOnInsert:/u);
  assert.match(txn, /await session\.endSession\(\)/u);
});
verify('queue registration fails closed and transaction rollback is tested', () => {
  assert.match(txn, /if \(!this\.orphanCleanup\)/u);
  assert.match(mongoUnit, /B72 aborts retirement transaction if orphan enqueue fails/u);
  assert.match(mongoUnit, /B72 refuses retirement if private cleanup queue is unregistered/u);
});
verify('CAS misses are observable without starting a delete', () => {
  assert.match(processor, /expirationStale: number/u);
  assert.match(retire, /if \(retired\) result\.expiredRetired \+= 1;/u);
  assert.match(retire, /else result\.expirationStale \+= 1;/u);
  assert.match(processorUnit, /B72 handles expiry CAS loss without deleting S3/u);
});
verify('expiration metrics continue to log in absence of fresh export jobs', () => {
  assert.match(telemetry, /iteration\.expiredRetired > 0/u);
  assert.match(telemetry, /iteration\.expirationStale > 0/u);
});
verify('unit regression covers blocked Mongo sweep and forward progress', () => {
  assert.match(processorUnit, /B72 survives an expired-sweep Mongo read outage/u);
  assert.match(processorUnit, /B72 leaves S3 untouched after a transactional retirement exception/u);
});
verify('Mongo replica opt-in covers retirement, crash recovery, rollback and expiry change', () => {
  assert.match(integration, /B72 retires an expired download and drains exact S3 cleanup/u);
  assert.match(integration, /B72 retains durable expiry intent across crash and transient S3 outage/u);
  assert.match(integration, /B72 rolls back expiry unlink when insertion into the cleanup queue fails/u);
  assert.match(integration, /B72 refuses a stale expiry CAS after a concurrent retention extension/u);
});
verify('production remains blocked independent of source-level acceptance', () => {
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
});
console.log('B72 atomic expiry: ' + passed + ' structural safeguards PASS');
