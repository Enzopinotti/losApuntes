import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const prefix = 'apps/api/src/data-lifecycle/';
const predicates = read(prefix + 'domain/account-export-mongo-lease-clock.ts');
const mongo = read(prefix + 'mongo/mongo-account-export.store.ts');
const cleanupPlan = read(prefix + 'domain/account-export-expired-claim-fence.ts');
const storeTests = read(prefix + 'mongo/mongo-account-export.store.spec.ts');
const mongoAcceptance = read('apps/api/src/study-progress/mongo/study-progress.mongo-int.spec.ts');
const config = read('apps/api/src/config/runtime-environment.ts');
const scripts = JSON.parse(read('package.json')).scripts;

const sliceMethod = (name, until) =>
  mongo.slice(mongo.indexOf('  async ' + name + '('), mongo.indexOf('  async ' + until + '('));

let count = 0;
function check(label, assertion) {
  assertion();
  count += 1;
  console.log('PASS ' + label);
}

check('B83 uses Mongo primary $$NOW instead of request clock for live lease', () => {
  assert.match(predicates, /\$expr: \{ \$gt: \['\$leaseExpiresAt', '\$\$NOW'\] \}/u);
});
check('B83 uses Mongo primary $$NOW instead of request clock for expired lease', () => {
  assert.match(predicates, /\$expr: \{ \$lte: \['\$leaseExpiresAt', '\$\$NOW'\] \}/u);
});
check('lease renewal CAS requires live lease at actual Mongo evaluation', () => {
  const method = sliceMethod('renewLease', 'reschedule');
  assert.match(method, /leaseExpiresAt: \{ \$gt: input\.now \}/u);
  assert.match(method, /\.\.\.accountExportLeaseActiveOnMongoServer\(\)/u);
});
check('failed export rescheduling requires same server-time lease fence', () => {
  const method = sliceMethod('reschedule', 'complete');
  assert.match(method, /leaseExpiresAt: \{ \$gt: input\.now \}/u);
  assert.match(method, /\.\.\.accountExportLeaseActiveOnMongoServer\(\)/u);
});
check('v1 v2 and v3 completion share atomic server-time Mongo filter', () => {
  const method = sliceMethod('complete', 'findExpiredArtifacts');
  const pred = method.indexOf('...accountExportLeaseActiveOnMongoServer()');
  const legacy = method.indexOf('this.jobs.updateOne(filter, update)');
  const v3 = method.indexOf('this.jobs');
  assert.ok(pred > 0 && legacy > pred && v3 > 0);
  assert.match(method, /leaseExpiresAt: \{ \$gt: input\.completedAt \}/u);
  assert.match(method, /this\.jobs\s*\.updateOne\(\{ \.\.\.filter, userId: ownerUserId \}, update, \{ session \}\)/u);
});
check('B82 expired generation revocation still binds original CAS and Mongo server clock', () => {
  assert.match(cleanupPlan, /leaseExpiresAt: \{ \$lte: input\.now \}/u);
  assert.match(cleanupPlan, /\.\.\.accountExportLeaseExpiredOnMongoServer\(\)/u);
  assert.match(cleanupPlan, /claimId: input\.generation/u);
  assert.match(cleanupPlan, /artifactGeneration: null/u);
});
check('v1/v2 store Jest verifies dual lease predicates', () => {
  assert.match(storeTests, /B83 server-side lease freshness is required/u);
  assert.match(storeTests, /\$expr: \{ \$gt: \['\$leaseExpiresAt', '\$\$NOW'\] \}/u);
});
check('v3 owner epoch transaction Jest verifies server clock', () => {
  assert.match(storeTests, /B83 v3 completion applies the same server clock fence/u);
  assert.match(storeTests, /expectedProgressEpoch: 7/u);
});
check('renewal and rescheduling Jest verify server clock', () => {
  assert.match(storeTests, /B83 requires server-clock authority for lease renewal/u);
});
check('opt-in real Mongo tests verify late completion v1/v2 and v3 rollback', () => {
  assert.match(mongoAcceptance, /B83 v%s rejects late Mongo completion/u);
  assert.match(mongoAcceptance, /B83 v3 rollback does not bump owner epoch/u);
});
check('opt-in real Mongo tests verify stale renewal, retry and early revocation', () => {
  assert.match(mongoAcceptance, /B83 prevents delayed renewal and reschedule/u);
  assert.match(mongoAcceptance, /B83 fails closed if worker clock attempts early orphan revocation/u);
});
check('B82 completion-wins integration uses a still-valid actual lease', () => {
  const start = mongoAcceptance.indexOf("it('B82 completion wins:");
  const end = mongoAcceptance.indexOf("it('B82 renewal wins:", start);
  const part = mongoAcceptance.slice(start, end);
  assert.match(part, /const leaseExpiresAt = new Date\(started\.getTime\(\) \+ 120_000\)/u);
  assert.match(part, /\}\),?\s*\)\.resolves\.toBe\(true\)/u);
});
check('root lifecycle chain invokes both B83 executable tests and source guard', () => {
  const chain = scripts['test:account-lifecycle-contract'];
  assert.match(chain, /test-account-export-b83-mongo-clock\.test\.mjs/u);
  assert.match(chain, /test-account-export-b83-mongo-clock-guard\.mjs/u);
});
check('B82 and B81 regression suite stays present', () => {
  const chain = scripts['test:account-lifecycle-contract'];
  assert.match(chain, /test-account-export-b82-fence\.test\.mjs/u);
  assert.match(chain, /test-account-export-b81-s3-abort\.test\.mjs/u);
});
check('production release remains on HOLD', () => {
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
  assert.match(read('docs/operations/account-export-artifacts.md'), /B83/u);
});
console.log('B83 Mongo authoritative lease clock: ' + count + ' source contracts PASS');
