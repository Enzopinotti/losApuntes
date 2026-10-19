import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const prefix = 'apps/api/src/data-lifecycle/';
const contract = read(prefix + 'domain/account-export.store.ts');
const plan = read(prefix + 'domain/account-export-expired-claim-fence.ts');
const mongo = read(prefix + 'mongo/mongo-account-export.store.ts');
const processor = read(prefix + 'domain/account-export-processor.ts');
const unit = read(prefix + 'domain/account-export-processor.spec.ts');
const storeUnit = read(prefix + 'mongo/mongo-account-export.store.spec.ts');
const integration = read('apps/api/src/study-progress/mongo/study-progress.mongo-int.spec.ts');
const scripts = JSON.parse(read('package.json')).scripts;
const config = read('apps/api/src/config/runtime-environment.ts');
const process = processor.slice(processor.indexOf('  private async drainOrphanCleanup('),
  processor.indexOf('  private async deleteExpiredArtifacts('));
const fence = mongo.slice(mongo.indexOf('  async fenceExpiredClaimForOrphanCleanup('),
  mongo.indexOf('  async claimNext('));

let checks = 0;
function test(label, assertion) { assertion(); checks++; console.log('PASS ' + label); }

test('private store interface exposes expired-current-claim revocation', () => {
  assert.match(contract, /fenceExpiredClaimForOrphanCleanup\(input:/u);
  assert.match(contract, /Promise<boolean>/u);
});
test('Mongo CAS planner restricts exact owner, generation, active state, unreferenced artifact', () => {
  assert.match(plan, /userId: input\.ownerUserId/u);
  assert.match(plan, /state: 'processing' as const/u);
  assert.match(plan, /claimId: input\.generation/u);
  assert.match(plan, /artifactGeneration: null/u);
  assert.match(plan, /leaseExpiresAt: \{ \$lte: input\.now \}/u);
});
test('Mongo CAS revokes current generation and allows new pending attempt', () => {
  assert.match(plan, /state: 'pending' as const/u);
  assert.match(plan, /claimId: null/u);
  assert.match(plan, /nextAttemptAt: input\.now/u);
  assert.match(plan, /failureCode: 'EXPORT_ASSEMBLY_RETRY'/u);
});
test('Mongo store uses one atomic updateOne on job document and exact result', () => {
  assert.match(fence, /planAccountExportExpiredClaimFence\(input\)/u);
  assert.match(fence, /this\.jobs\.updateOne\(\s*plan\.filter,\s*plan\.update\)/u);
  assert.match(fence, /revoked\.modifiedCount === 1/u);
});
test('drainer revokes only current processing generation with expired valid Date lease', () => {
  assert.match(process, /job\.state === 'processing'/u);
  assert.match(process, /job\.claimId === candidate\.generation/u);
  assert.match(process, /job\.leaseExpiresAt instanceof Date/u);
  assert.match(process, /Number\.isFinite\(job\.leaseExpiresAt\.getTime\(\)\)/u);
});
test('no object DELETE if cleanup revocation CAS fails or throws', () => {
  const revocation = process.indexOf('const revoked = await this.store.fenceExpiredClaimForOrphanCleanup(');
  const blocked = process.indexOf('if (!revoked)');
  const deleteAt = process.indexOf('await this.artifacts.deleteArtifact(');
  assert.ok(revocation >= 0 && blocked > revocation && deleteAt > blocked);
  assert.match(process.slice(blocked, deleteAt), /throw new Error\('Account export cleanup claim revocation lost CAS'\)/u);
});
test('existing queue fence still renews owner lease before S3', () => {
  const renewed = process.indexOf('const owned = await this.orphans.renewLease(');
  const deleted = process.indexOf('await this.artifacts.deleteArtifact(');
  assert.ok(renewed >= 0 && deleted > renewed);
  assert.match(process, /findForOrphanCleanup\(candidate\.jobId\)/u);
  assert.match(process, /job\.artifactGeneration === candidate\.generation/u);
});
test('processor unit coverage includes CAS ordering, completion winner, malformed lease', () => {
  assert.match(unit, /B82 revokes a matching expired claim before touching S3/u);
  assert.match(unit, /B82 refuses S3 DELETE if a delayed completion wins/u);
  assert.match(unit, /B82 rejects a malformed current lease/u);
  assert.match(unit, /B82 never revokes a different current generation/u);
});
test('Mongo store unit coverage for exact filter and failed or forged CAS', () => {
  assert.match(storeUnit, /B82 revokes only the exact expired active generation/u);
  assert.match(storeUnit, /B82 refuses to revoke after a concurrent completion/u);
  assert.match(storeUnit, /B82 rejects forged generation/u);
});
test('real Mongo opt-in tests both completion/cleanup winners and renewal', () => {
  assert.match(integration, /B82 cleanup wins: stale pre-expiry completion/u);
  assert.match(integration, /B82 completion wins: exact referenced S3 generation/u);
  assert.match(integration, /B82 renewal wins: cleanup CAS fails/u);
});
test('Node pure planner and structural contract are wired into lifecycle', () => {
  const chain = scripts['test:account-lifecycle-contract'];
  assert.match(chain, /test-account-export-b82-fence\.test\.mjs/u);
  assert.match(chain, /test-account-export-b82-fence-guard\.mjs/u);
});
test('production release remains explicitly held', () => {
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
  assert.match(read('docs/operations/account-export-artifacts.md'), /B82/u);
});
console.log('B82 expired-current-claim completion fence: ' + checks + ' structural contracts PASS');
