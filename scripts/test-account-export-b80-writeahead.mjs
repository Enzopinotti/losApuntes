import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const prefix = 'apps/api/src/data-lifecycle/';
const claim = read(prefix + 'mongo/mongo-account-export.store.ts');
const plan = read(prefix + 'domain/account-export-claim-writeahead.ts');
const processor = read(prefix + 'domain/account-export-processor.ts');
const mongoSpec = read(prefix + 'mongo/mongo-account-export.store.spec.ts');
const integration = read('apps/api/src/study-progress/mongo/study-progress.mongo-int.spec.ts');
const module = read(prefix + 'data-lifecycle.module.ts');
const policy = read('infra/storage/account-export-runtime-policy.template.json');
const root = JSON.parse(read('package.json'));
const claimMethod = claim.slice(claim.indexOf('  async claimNext('), claim.indexOf('  async renewLease('));
let count = 0;
const verify = (name, callback) => {
  callback(); count += 1; console.log('PASS ' + name);
};

verify('EVERY newly claimed export generation receives write-ahead intent', () => {
  const start = claimMethod.indexOf('const previous = await this.jobs');
  const takeOver = claimMethod.indexOf("if (previous.state === 'processing')");
  const writeAhead = claimMethod.indexOf('const writeAhead = planAccountExportClaimWriteAhead(');
  const returned = claimMethod.indexOf('claimed = await this.jobs');
  assert.ok(start >= 0 && takeOver > start && writeAhead > takeOver && returned > writeAhead);
  assert.ok(writeAhead > claimMethod.indexOf('}', takeOver));
  assert.match(claimMethod, /generation: input\.claimId/u);
});
verify('claim and recovery intent commit in SAME transaction before worker starts', () => {
  assert.match(claimMethod, /await session\.withTransaction\(async \(\) => \{/u);
  assert.match(claimMethod, /await this\.orphanCleanup!\.updateOne\([\s\S]*?\$setOnInsert: writeAhead/u);
  assert.match(claimMethod, /\{ upsert: true, session \}/u);
  assert.match(claimMethod, /return claimed;/u);
  assert.match(claimMethod, /await session\.endSession\(\)/u);
});
verify('existing B74 takeover monotonic due/verification fencing preserved', () => {
  assert.match(claimMethod, /oldGeneration/u);
  assert.match(claimMethod, /\$max: \{ verificationUntil \}/u);
  assert.match(claimMethod, /\$max: \{ nextAttemptAt: settleAt \}/u);
});
verify('safe delayed retry and post-delete verification are included up front', () => {
  assert.match(plan, /SETTLE_LEASE_MULTIPLIER = 3/u);
  assert.match(plan, /MULTIPART_RECHECK_HORIZON_MS = 60 \* 60_000/u);
  assert.match(plan, /input\.leaseExpiresAt\.getTime\(\)/u);
  assert.match(plan, /nextAttemptAt\.getTime\(\) \+ MULTIPART_RECHECK_HORIZON_MS/u);
});
verify('existing owner-fenced drainer remains the sole deletion path', () => {
  const drain = processor.slice(
    processor.indexOf('  private async drainOrphanCleanup('),
    processor.indexOf('  private async deleteExpiredArtifacts('),
  );
  assert.match(drain, /findForOrphanCleanup\(candidate\.jobId\)/u);
  assert.match(drain, /job\.artifactGeneration === candidate\.generation/u);
  assert.match(drain, /job\.claimId === candidate\.generation/u);
  assert.match(drain, /await this\.orphans\.renewLease\(/u);
  assert.match(drain, /await this\.artifacts\.deleteArtifact\(/u);
});
verify('Jest unit tests cover pending write, takeover and failure rollback', () => {
  assert.match(mongoSpec, /B80 claims pending work with recovery/u);
  assert.match(mongoSpec, /B80 refuses a pending claim when its new-generation intent fails/u);
  assert.match(mongoSpec, /B80 never exposes a claim if new write-ahead dates are invalid/u);
  assert.match(mongoSpec, /B74 atomically queues the previous attempt/u);
});
verify('real replica-set opt-in covers crash, restart, rollback and completed preservation', () => {
  assert.match(integration, /B80 persists a first-claim recovery intent/u);
  assert.match(integration, /B80 rolls back an ordinary pending claim/u);
  assert.match(integration, /B80 preserves a completed generation/u);
  assert.match(integration, /orphanVerificationScheduled: 1/u);
  assert.match(integration, /orphanPreserved: 1/u);
});
verify('worker continues using export-scoped isolated S3 and private queue', () => {
  assert.match(module, /ACCOUNT_EXPORT_ORPHAN_CLEANUP_STORE/u);
  assert.match(module, /ACCOUNT_EXPORT_S3_BUCKET/u);
  assert.match(policy, /s3:DeleteObject/u);
  assert.doesNotMatch(policy, /s3:ListBucket/u);
});
verify('root lifecycle runs executable B80 Node tests and guards', () => {
  const chain = root.scripts['test:account-lifecycle-contract'];
  assert.match(chain, /test-account-export-b80-writeahead\.test\.mjs/u);
  assert.match(chain, /test-account-export-b80-writeahead\.mjs/u);
  assert.match(chain, /test-account-export-b78-queue\.mjs/u);
});
console.log('B80 claim write-ahead recovery: ' + count + ' structural contracts PASS');
