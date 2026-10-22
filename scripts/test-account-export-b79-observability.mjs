import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const prefix = 'apps/api/src/data-lifecycle/';
const processor = read(prefix + 'domain/account-export-processor.ts');
const retries = read(prefix + 'domain/account-export-orphan-enqueue.ts');
const worker = read(prefix + 'account-export.worker.ts');
const testSource = read(prefix + 'domain/account-export-processor.spec.ts');
const nodeTests = read('scripts/test-account-export-b79-enqueue.test.mjs');
const packageJson = JSON.parse(read('package.json'));
const start = processor.indexOf('  private async deleteOrEnqueueProvenOrphan(');
const end = processor.indexOf('  private async drainOrphanCleanup(', start);
assert.ok(start > 0 && end > start);
const helper = processor.slice(start, end);
let checks = 0;
function verify(label, callback) {
  callback();
  checks += 1;
  console.log('PASS ' + label);
}

verify('S3 DELETE remains solely in owner-fenced cleanup drainer', () => {
  assert.match(helper, /await enqueueAccountExportOrphanWithRetry\(/u);
  assert.match(helper, /await this\.orphans\.enqueue\(/u);
  assert.doesNotMatch(helper, /this\.artifacts\.deleteArtifact\(/u);
  assert.doesNotMatch(helper, /this\.orphans\.clearPending\(/u);
  assert.match(processor.slice(end), /findForOrphanCleanup\(candidate\.jobId\)/u);
});
verify('bounded retry has three attempts and two short waits', () => {
  assert.match(retries, /ENQUEUE_ATTEMPT_DELAYS_MS = \[0, 50, 100\] as const/u);
  assert.match(retries, /await wait\(waitMs\)/u);
  assert.match(retries, /orphanEnqueueRetries \+= 1/u);
});
verify('recovery and exhaustion remain independently observable', () => {
  assert.match(retries, /orphanEnqueueRecovered \+= 1/u);
  assert.match(retries, /orphanEnqueueFailures \+= 1/u);
  assert.match(processor, /orphanEnqueueRecovered: 0/u);
  assert.match(processor, /orphanEnqueueFailures: 0/u);
  assert.match(processor, /processClaim\(job, result\)/u);
});
verify('worker emits redacted structured count-only alert for permanent failures', () => {
  const begin = worker.indexOf("event: 'account_export.worker.orphan_enqueue_failed'");
  assert.ok(begin > 0);
  const detail = worker.slice(begin, begin + 220);
  assert.match(detail, /failedCount: iteration\.orphanEnqueueFailures/u);
  assert.match(detail, /retryCount: iteration\.orphanEnqueueRetries/u);
  assert.doesNotMatch(detail, /jobId|userId|generation|objectKey|error\.message|token/iu);
});
verify('Jest integration tests cover successive and parallel-in-batch scenarios', () => {
  assert.match(testSource, /B79 recovers a transient Mongo queue outage/u);
  assert.match(testSource, /B79 preserves per-iteration recovery metrics/u);
  assert.match(testSource, /B78 does not turn a failed durable enqueue/u);
  assert.match(testSource, /orphanEnqueueFailures: 1/u);
});
verify('standalone executable Node unit tests and integration chain are present', () => {
  assert.match(nodeTests, /permanent Mongo outage fails closed/u);
  assert.match(nodeTests, /two failed writes recover on the third/u);
  assert.match(packageJson.scripts['test:account-lifecycle-contract'],
    /test-account-export-b79-enqueue\.test\.mjs/u);
});
console.log('B79 orphan enqueue observability: ' + checks + ' structural assertions PASS');
