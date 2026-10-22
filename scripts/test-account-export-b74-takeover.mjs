import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const source = read('apps/api/src/data-lifecycle/mongo/mongo-account-export.store.ts');
const tests = read('apps/api/src/data-lifecycle/mongo/mongo-account-export.store.spec.ts');
const integration = read('apps/api/src/study-progress/mongo/study-progress.mongo-int.spec.ts');
const processor = read('apps/api/src/data-lifecycle/domain/account-export-processor.ts');
const moduleWiring = read('apps/api/src/data-lifecycle/data-lifecycle.module.ts');
const config = read('apps/api/src/config/runtime-environment.ts');

let checks = 0;
function verify(name, callback) {
  callback();
  checks += 1;
  console.log('PASS ' + name);
}
const claim = source.slice(source.indexOf('  async claimNext('),source.indexOf('  async renewLease('));
verify('takeover and cleanup insert run in one Mongo transaction', () => {
  assert.match(claim, /await session\.withTransaction\(async \(\) => \{/u);
  assert.match(claim, /await this\.orphanCleanup!\.updateOne\(/u);
  assert.match(claim, /\{ upsert: true, session \}/u);
  assert.match(claim, /await session\.endSession\(\)/u);
});
verify('takeover reads previous state from pre-image rather than new claim', () => {
  assert.match(claim, /new: false/u);
  assert.match(claim, /if \(previous\.state === 'processing'\)/u);
  assert.match(claim, /generation: oldGeneration/u);
});
verify('pending claims never manufacture a nonexistent predecessor ledger', () => {
  const takeover = claim.slice(
    claim.indexOf("if (previous.state === 'processing')"),
    claim.indexOf('// B80: even a first pending claim'),
  );
  assert.match(takeover, /oldGeneration/u);
  assert.match(takeover, /generation: oldGeneration/u);
  assert.match(claim, /generation: input\.claimId/u);
  assert.match(tests, /B80 claims pending work with recovery for the new generation/u);
});
verify('expired claim input verifies generation and durable owner', () => {
  assert.match(claim, /previous\.id\?\.trim\(\)/u);
  assert.match(claim, /previous\.userId\?\.trim\(\)/u);
  assert.match(claim, /oldGeneration === input\.claimId/u);
  assert.match(claim, /takeover generation is invalid/u);
});
verify('old object deletion is deferred for in-flight multipart settlement', () => {
  assert.match(claim, /ACCOUNT_EXPORT_LEASE_DURATION_MS \* 3/u);
  assert.match(claim, /nextAttemptAt: settleAt/u);
  assert.match(integration, /Do not delete while the old multipart writer may still be settling/u);
});
verify('the old owner comes from the durable pre-image', () => {
  assert.match(claim, /ownerUserId: previous\.userId/u);
  assert.match(claim, /jobId: previous\.id/u);
  assert.match(claim, /\$setOnInsert/u);
});
verify('only the new exact claim returned to worker after postcondition read', () => {
  assert.match(claim, /claimId: input\.claimId/u);
  assert.match(claim, /takeover postcondition failed/u);
  assert.match(claim, /return claimed;/u);
  assert.match(claim, /claimed = null;/u);
});
verify('the queue model is mandatory for any claim takeover', () => {
  assert.match(claim, /if \(!this\.orphanCleanup\)/u);
  assert.match(moduleWiring, /AccountExportOrphanCleanup\.name/u);
  assert.match(tests, /B74 rolls back a takeover if the orphan queue cannot persist/u);
});
verify('real Mongo acceptance covers recovery and rollback after queue failure', () => {
  assert.match(integration, /B74 atomically records an expired claim generation/u);
  assert.match(integration, /B74 preserves an expired claim if its takeover cleanup queue cannot be written/u);
  assert.match(integration, /B74 claims ordinary pending exports/u);
});
verify('queue drain still demands durable owner and exact lease authority before delete', () => {
  assert.match(processor, /this\.store\.findForOrphanCleanup\(candidate\.jobId\)/u);
  assert.match(processor, /job\.userId !== candidate\.ownerUserId/u);
  assert.match(processor, /job\.artifactGeneration === candidate\.generation/u);
  assert.match(processor, /await this\.orphans\.renewLease\(/u);
});
verify('job ordinary expiration retirement stays transactional', () => {
  assert.match(source, /async retireExpiredArtifact\(/u);
  assert.match(source, /await this\.orphanCleanup!\.updateOne\(/u);
});
verify('production is still held', () => {
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
});
console.log('B74 expired-claim takeover: ' + checks + ' source contracts PASS');
