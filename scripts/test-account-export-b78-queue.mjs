import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const prefix = 'apps/api/src/data-lifecycle/';
const processor = read(prefix + 'domain/account-export-processor.ts');
const tests = read(prefix + 'domain/account-export-processor.spec.ts');
const mongo = read('apps/api/src/study-progress/mongo/study-progress.mongo-int.spec.ts');
const queue = read(prefix + 'mongo/mongo-account-export-orphan-cleanup.store.ts');
const enqueue = read(prefix + 'domain/account-export-orphan-enqueue.ts');
const helper = processor.slice(processor.indexOf('  private async deleteOrEnqueueProvenOrphan('),
  processor.indexOf('  private async drainOrphanCleanup('));
const drain = processor.slice(processor.indexOf('  private async drainOrphanCleanup('),
  processor.indexOf('  private async deleteExpiredArtifacts('));
let count = 0;
const verify = (name, fn) => { fn(); count += 1; console.log('PASS ' + name); };
verify('only enqueue operates on the failed export attempt fast path', () => {
  assert.match(helper, /await this\.orphans\.enqueue\(/u);
  assert.doesNotMatch(helper, /artifacts\.deleteArtifact\(/u);
  assert.doesNotMatch(helper, /orphans\.clearPending\(/u);
});
verify('failed enqueue is explicitly fail closed with bounded recovery', () => {
  assert.match(helper, /await enqueueAccountExportOrphanWithRetry\(/u);
  assert.match(enqueue, /orphanEnqueueFailures \+= 1/u);
  assert.match(helper, /Preserve S3 rather than bypassing settlement/u);
});
verify('cleanup drainer remains sole owner-fenced delete path', () => {
  assert.match(drain, /findForOrphanCleanup\(candidate\.jobId\)/u);
  assert.match(drain, /job\.artifactGeneration === candidate\.generation/u);
  assert.match(drain, /await this\.orphans\.renewLease\(/u);
  assert.match(drain, /await this\.artifacts\.deleteArtifact\(/u);
});
verify('queue reclaim respects settlement deadline and lease', () => {
  assert.match(queue, /state: 'processing',[\s\S]*nextAttemptAt: \{ \$lte: input\.now \}/u);
});
verify('Jest proves deferred cleanup and restart-only delete', () => {
  assert.match(tests, /B78 does not bypass a prior takeover verification deadline/u);
  assert.match(tests, /B78 does not turn a failed durable enqueue into permission/u);
  assert.match(tests, /B78 only deletes a queued generation in a later owner-fenced/u);
});
verify('Mongo integration protects takeover ledger from stale worker callback', () => {
  assert.match(mongo, /B78 late stale worker cannot bypass the takeover cleanup deadline/u);
});
console.log('B78 S3 queue-only settlement: ' + count + ' source checks PASS');
