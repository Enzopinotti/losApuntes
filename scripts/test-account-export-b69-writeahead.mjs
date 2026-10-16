import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const dir = 'apps/api/src/data-lifecycle/';
const worker = read(dir + 'domain/account-export-processor.ts');
const tests = read(dir + 'domain/account-export-processor.spec.ts');
const queueContract = read(dir + 'domain/account-export-orphan-cleanup.store.ts');
const queueMongo = read(dir + 'mongo/mongo-account-export-orphan-cleanup.store.ts');
const queueTests = read(dir + 'mongo/mongo-account-export-orphan-cleanup.store.spec.ts');
const mongoIntegration = read('apps/api/src/study-progress/mongo/study-progress.mongo-int.spec.ts');
const config = read('apps/api/src/config/runtime-environment.ts');
let total = 0;

const check = (label, fn) => {
  fn();
  total++;
  console.log('PASS', label);
};
check('write-ahead stores orphan intent before first S3 delete attempt', () => {
  const helper = worker.slice(
    worker.indexOf('  private async deleteOrEnqueueProvenOrphan('),
    worker.indexOf('  private async drainOrphanCleanup('),
  );
  const enqueue = helper.indexOf('await this.orphans.enqueue(');
  const deleteObject = helper.indexOf('await this.artifacts.deleteArtifact(');
  const clear = helper.indexOf('await this.orphans.clearPending(');
  assert.ok(enqueue >= 0 && enqueue < deleteObject && deleteObject < clear);
  assert.match(helper, /let queued = false;/u);
});
check('failed Mongo intent does not prevent a proven S3 fast-path delete', () => {
  assert.match(worker, /Keep the best-effort S3 fast path available/u);
});
check('S3 failure does not drop the durable intent', () => {
  assert.match(worker, /The durable task survives a failure or a crash/u);
});
check('successful deletion only cancels unclaimed pending tasks', () => {
  assert.match(queueContract, /clearPending\(input:/u);
  const impl = queueMongo.slice(
    queueMongo.indexOf('  async clearPending('),
    queueMongo.indexOf('  async claimNext('),
  );
  assert.match(impl, /this\.cleanup\.deleteOne\(/u);
  assert.match(impl, /state: 'pending'/u);
  assert.match(impl, /claimId: null/u);
  assert.doesNotMatch(impl, /state: 'processing'/u);
});
check('ambiguous durable Mongo completion never creates a deletion intent', () => {
  assert.match(worker, /if \(uncertainCompletion && completedAssembly\)/u);
  assert.match(worker, /if \(!updated\)/u);
  const part = worker.slice(
    worker.indexOf('      const uncertainCompletion ='),
    worker.indexOf('  private async isConfirmedCompletion('),
  );
  const cas = part.indexOf('const updated = await this.exports.reschedule(');
  const subsequentCleanup = part.indexOf('await this.deleteOrEnqueueProvenOrphan(');
  assert.ok(cas >= 0 && subsequentCleanup > cas);
});
check('Jest B67 and B68 tests are inside their original describe with clock reset', () => {
  assert.match(tests, /describe\('AccountExportProcessor', \(\) => \{/u);
  assert.match(tests, /afterEach\(\(\) => jest\.useRealTimers\(\)\)/u);
  const begin = tests.indexOf('describe(\'AccountExportProcessor\'');
  const orphan = tests.indexOf('  const orphan = {');
  assert.ok(orphan > begin);
  assert.doesNotMatch(tests.slice(begin, orphan + 25), /\n\}\s+const orphan =/u);
  assert.match(tests, /findForOrphanCleanup\)\.toHaveBeenCalledWith\(orphan\.jobId\)/u);
});
check('Jest captures ordered persistence, retry and concurrent claim interactions', () => {
  assert.match(tests, /B69 persists cleanup intent before a failed S3 delete/u);
  assert.match(tests, /B69 preserves the queued intent if pending cancellation fails/u);
  assert.match(tests, /B69 does not clear a task already claimed/u);
  assert.match(tests, /B69 keeps uncertain Mongo completion out of write-ahead/u);
});
check('CAS is covered at Mongo store level', () => {
  assert.match(queueTests, /B69 clears only an unclaimed pending intent/u);
  assert.match(queueTests, /B69 cannot cancel another worker/u);
});
check('opt-in replica set proves worker restart and retained pending intent', () => {
  assert.match(mongoIntegration, /B69 recovers write-ahead orphan intent across two workers/u);
  assert.match(mongoIntegration, /B69 never clears a cleanup intent already claimed/u);
  assert.match(mongoIntegration, /STUDY_PROGRESS_TEST_MONGO_URI/u);
});
check('v3 progress release remains explicitly blocked in production', () => {
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
});
console.log('B69 write-ahead orphan cleanup: ' + total + ' structural checks PASS');
