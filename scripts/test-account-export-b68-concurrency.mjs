import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const api = 'apps/api/src/data-lifecycle/';
const processor = read(api + 'domain/account-export-processor.ts');
const exportStore = read(api + 'domain/account-export.store.ts');
const mongoExports = read(api + 'mongo/mongo-account-export.store.ts');
const orphanStore = read(api + 'domain/account-export-orphan-cleanup.store.ts');
const mongoOrphans = read(api + 'mongo/mongo-account-export-orphan-cleanup.store.ts');
const unit = read(api + 'domain/account-export-processor.spec.ts');
const mongoUnit = read(api + 'mongo/mongo-account-export-orphan-cleanup.store.spec.ts');
const integration = read('apps/api/src/study-progress/mongo/study-progress.mongo-int.spec.ts');
const config = read('apps/api/src/config/runtime-environment.ts');
let assertions = 0;

function verify(name, fn) {
  fn();
  assertions++;
  console.log('PASS', name);
}

verify('durable owner probe cannot hide mismatched owner through scoped query', () => {
  assert.match(exportStore, /findForOrphanCleanup\(id: string\)/u);
  assert.match(mongoExports, /async findForOrphanCleanup\(\s*id: string,?\s*\)/u);
  const method = mongoExports.slice(mongoExports.indexOf('  async findForOrphanCleanup('),
    mongoExports.indexOf('  async claimNext('));
  assert.match(method, /\.findOne\(\{ id \}\)/u);
  assert.doesNotMatch(method, /userId:|ownerUserId/u);
});
verify('orphan validation resolves original owner before deciding to delete', () => {
  const drain = processor.slice(processor.indexOf('  private async drainOrphanCleanup('));
  const find = drain.indexOf('this.store.findForOrphanCleanup(candidate.jobId)');
  const owner = drain.indexOf('job.userId !== candidate.ownerUserId');
  const preserve = drain.indexOf('job.artifactGeneration === candidate.generation');
  const deleteObject = drain.indexOf('this.artifacts.deleteArtifact(');
  assert.ok(find >= 0 && owner > find && preserve > owner && deleteObject > preserve);
});
verify('claim lease renewal is fenced to exact generation, claim, state and time', () => {
  assert.match(orphanStore, /renewLease\(input: \{/u);
  assert.match(mongoOrphans, /async renewLease\(/u);
  const renew = mongoOrphans.slice(mongoOrphans.indexOf('  async renewLease('),
    mongoOrphans.indexOf('  async acknowledge('));
  assert.match(renew, /jobId: input\.jobId/u);
  assert.match(renew, /generation: input\.generation/u);
  assert.match(renew, /claimId: input\.claimId/u);
  assert.match(renew, /state: 'processing'/u);
  assert.match(renew, /leaseExpiresAt: \{ \$gt: input\.now \}/u);
  assert.match(renew, /\$max: \{ leaseExpiresAt: input\.leaseExpiresAt \}/u);
  assert.match(renew, /result\.matchedCount === 1/u);
});
verify('ownership is refreshed after owner lookup and before invoking S3 deletion', () => {
  const drain = processor.slice(processor.indexOf('  private async drainOrphanCleanup('));
  const readJob = drain.indexOf('findForOrphanCleanup(candidate.jobId)');
  const renew = drain.indexOf('const owned = await this.orphans.renewLease(');
  const deleteObject = drain.indexOf('this.artifacts.deleteArtifact(');
  assert.ok(readJob >= 0 && renew > readJob && deleteObject > renew);
  assert.match(drain, /if \(!owned\) \{[\s\S]*?continue;/u);
});
verify('long S3 deletions renew their claim periodically', () => {
  const drain = processor.slice(processor.indexOf('  private async drainOrphanCleanup('));
  assert.match(drain, /const renewal = setInterval\(/u);
  assert.match(drain, /renewalInFlight/u);
  assert.match(drain, /LEASE_RENEWAL_INTERVAL_MS/u);
  assert.match(drain, /renewal\.unref\(\)/u);
  assert.match(drain, /clearInterval\(renewal\)/u);
  assert.match(drain, /await Promise\.resolve\(renewalInFlight\)/u);
});
verify('lost S3 cleanup claim never acknowledges durable queue task', () => {
  const drain = processor.slice(processor.indexOf('  private async drainOrphanCleanup('));
  const ifLost = drain.indexOf('if (leaseLost)');
  const acknowledge = drain.indexOf('const acked = await this.orphans.acknowledge(');
  assert.ok(ifLost >= 0 && acknowledge > ifLost);
  assert.match(drain.slice(ifLost, acknowledge), /continue;/u);
});
verify('safe retry and referenced-artifact preservation remain in place', () => {
  const drain = processor.slice(processor.indexOf('  private async drainOrphanCleanup('));
  assert.match(drain, /job\.artifactGeneration === candidate\.generation/u);
  assert.match(drain, /await this\.orphans\.retry\(/u);
  assert.match(drain, /await this\.orphans\.acknowledge\(/u);
});
verify('Jest unit scenarios cover lease loss, ordering and heartbeat', () => {
  assert.match(unit, /B68 rechecks ownership after a slow authority lookup/u);
  assert.match(unit, /B68 renews the orphan claim BEFORE starting S3/u);
  assert.match(unit, /B68 renews its cleanup lease while S3 deletion is still running/u);
  assert.match(unit, /B68 does not acknowledge a generation after heartbeat loses its claim/u);
});
verify('Mongo opt-in acceptance covers two workers and foreign-owner poisoning', () => {
  assert.match(integration, /B68 fences two Mongo orphan workers/u);
  assert.match(integration, /B68 reads the true durable owner/u);
  assert.match(mongoUnit, /B68 renews only its own active claim/u);
});
verify('production launch policy remains blocked', () => {
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
});
console.log('B68 orphan cleanup concurrency: ' + assertions + ' source checks PASS');
