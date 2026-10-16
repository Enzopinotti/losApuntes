import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const base = 'apps/api/src/data-lifecycle/';
const planner = read(base + 'domain/account-export-mongo-claim-clock.ts');
const jobs = read(base + 'mongo/mongo-account-export.store.ts');
const queue = read(base + 'mongo/mongo-account-export-orphan-cleanup.store.ts');
const jobTests = read(base + 'mongo/mongo-account-export.store.spec.ts');
const queueTests = read(base + 'mongo/mongo-account-export-orphan-cleanup.store.spec.ts');
const mongo = read('apps/api/src/study-progress/mongo/study-progress.mongo-int.spec.ts');
const packageJson = JSON.parse(read('package.json'));
const config = read('apps/api/src/config/runtime-environment.ts');

const method = (source, begin, end) =>
  source.slice(source.indexOf('  async ' + begin + '('),
    source.indexOf('  async ' + end + '('));

let count = 0;
function check(name, run) {
  run();
  count += 1;
  console.log('PASS ' + name);
}

check('B84 Mongo claim eligibility is based on server $$NOW', () => {
  assert.match(planner, /\$lte: \['\$nextAttemptAt', '\$\$NOW'\]/u);
  assert.match(planner, /\$lte: \['\$leaseExpiresAt', '\$\$NOW'\]/u);
});
check('B84 malformed or missing due/lease dates are not authority', () => {
  assert.match(planner, /\$type: '\$nextAttemptAt'/u);
  assert.match(planner, /\$type: '\$leaseExpiresAt'/u);
  assert.match(planner, /'date'/u);
});
check('B84 job takeover retains client CAS and adds Mongo primary CAS', () => {
  const claim = method(jobs, 'claimNext', 'renewLease');
  assert.match(claim, /\{ state: 'pending', nextAttemptAt: \{ \$lte: input\.now \} \}/u);
  assert.match(claim, /state: 'processing'/u);
  assert.match(claim, /\.\.\.accountExportJobClaimDueOnMongoServer\(\)/u);
  assert.match(claim, /session\.withTransaction/u);
  assert.match(claim, /\$setOnInsert: writeAhead/u);
});
check('B84 queue claim retains both client conditions and server eligibility', () => {
  const claim = method(queue, 'claimNext', 'renewLease');
  assert.match(claim, /state: 'pending'/u);
  assert.match(claim, /state: 'processing'/u);
  assert.match(claim, /nextAttemptAt: \{ \$lte: input\.now \}/u);
  assert.match(claim, /leaseExpiresAt: \{ \$lte: input\.now \}/u);
  assert.match(claim, /\.\.\.accountExportOrphanClaimDueOnMongoServer\(\)/u);
});
check('B84 cleanup renew is fenced against primary lease loss or newly deferred due date', () => {
  const source = method(queue, 'renewLease', 'acknowledge');
  assert.match(source, /verificationUntil: input\.verificationUntil \?\? null/u);
  assert.match(source, /\.\.\.accountExportOrphanOwnedAndDueOnMongoServer\(\)/u);
});
check('B84 cleanup ACK is fenced against primary lease loss and due extension', () => {
  const source = method(queue, 'acknowledge', 'retry');
  assert.match(source, /\.\.\.accountExportOrphanOwnedAndDueOnMongoServer\(\)/u);
  assert.match(source, /leaseExpiresAt: \{ \$gt: input\.now \}/u);
});
check('B84 cleanup retry is fenced against primary lease loss and due extension', () => {
  const source = queue.slice(queue.indexOf('  async retry('));
  assert.match(source, /\.\.\.accountExportOrphanOwnedAndDueOnMongoServer\(\)/u);
  assert.match(source, /\$max: \{ nextAttemptAt: input\.nextAttemptAt \}/u);
});
check('B84 protects publication and cleanup B82/B83 fences', () => {
  assert.match(jobs, /fenceExpiredClaimForOrphanCleanup/u);
  assert.match(jobs, /accountExportLeaseActiveOnMongoServer\(\)/u);
  assert.match(read(base + 'domain/account-export-processor.ts'),
    /await this\.artifacts\.deleteArtifact\(/u);
});
check('B84 job store unit covers Mongo due and failed early client takeover', () => {
  assert.match(jobTests, /B84 fences pending and expired job takeover/u);
  assert.match(jobTests, /accountExportJobClaimDueOnMongoServer/u);
});
check('B84 queue unit covers primary eligibility, renewal, ACK and retry', () => {
  assert.match(queueTests, /B84 candidate selection demands Mongo primary due/u);
  assert.match(queueTests, /B84 queue settlement and ACK/u);
  assert.match(queueTests, /accountExportOrphanOwnedAndDueOnMongoServer/u);
});
check('B84 opt-in replica-set suite covers skew and deferred settlement', () => {
  assert.match(mongo, /B84 rejects an early job claim/u);
  assert.match(mongo, /B84 prevents premature takeover/u);
  assert.match(mongo, /B84 refuses early orphan claims/u);
  assert.match(mongo, /B84 preserves a processing orphan/u);
  assert.match(mongo, /B84 blocks stale ACK, retry and renewal/u);
});
check('B84 legacy Mongo tests no longer simulate primary clock progression with client now', () => {
  assert.match(mongo, /B84: expire the lease in the isolated Mongo fixture/u);
  assert.match(mongo, /B84: advance the isolated durable due date/u);
  assert.match(mongo, /B84: the old settlement\/lease have genuinely passed/u);
});
check('B84 lifecycle tests are wired and previous regressions remain', () => {
  const chain = packageJson.scripts['test:account-lifecycle-contract'];
  assert.match(chain, /test-account-export-b84-mongo-claim-clock\.test\.mjs/u);
  assert.match(chain, /test-account-export-b84-mongo-claim-guard\.mjs/u);
  assert.match(chain, /test-account-export-b83-mongo-clock-guard\.mjs/u);
  assert.match(chain, /test-account-export-b82-fence-guard\.mjs/u);
});
check('B84 release remains blocked', () => {
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
  assert.match(read('docs/operations/account-export-artifacts.md'), /B84/u);
});
console.log('B84 claim and orphan Mongo primary clock: ' + count + ' structural contracts PASS');
