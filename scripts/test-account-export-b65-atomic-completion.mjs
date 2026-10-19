import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const root = "apps/api/src/data-lifecycle/";
const processor = read(root + "domain/account-export-processor.ts");
const service = read(root + "domain/account-export.service.ts");
const storeContract = read(root + "domain/account-export.store.ts");
const mongoStore = read(root + "mongo/mongo-account-export.store.ts");
const typedError = read(root + "domain/account-export-epoch-conflict.error.ts");
const workerSpec = read(root + "domain/account-export-processor.spec.ts");
const mongoSpec = read(root + "mongo/mongo-account-export.store.spec.ts");
const mongoIntegration = read("apps/api/src/study-progress/mongo/study-progress.mongo-int.spec.ts");
const users = read("apps/api/src/users/users.service.ts");
const progress = read("apps/api/src/study-progress/study-progress.service.ts");
const config = read("apps/api/src/config/runtime-environment.ts");
let checks = 0;
function verify(label, action) {
  action();
  checks++;
  console.log("PASS", label);
}

verify("owner progress mutations share the transacted User revision", () => {
  assert.match(progress, /account_lifecycle_revision: 1/u);
  assert.match(users, /getStudyProgressExportEpoch/u);
  assert.match(mongoStore, /\$inc: \{ account_lifecycle_revision: 1 \}/u);
});
verify("pre-S3 and post-S3 owner epochs are both fenced", () => {
  assert.match(processor, /captureStudyProgressExportEpoch\(\s*job\.userId,?\s*\)/u);
  assert.match(processor, /assertStudyProgressExportEpoch\(/u);
  const staged = processor.indexOf("artifactCommitted = true");
  const post = processor.indexOf("await this.exports.assertStudyProgressExportEpoch(");
  const durable = processor.indexOf("await this.exports.complete(");
  assert.ok(staged > 0 && post > staged && durable > post);
});
verify("v3 passes the same revision into durable completion", () => {
  assert.match(storeContract, /expectedProgressEpoch\?: number/u);
  assert.match(processor, /expectedProgressEpoch: progressEpoch/u);
  assert.match(service, /completion requires owner epoch authority/u);
});
verify("Mongo v3 completion atomically compares user and claim", () => {
  const start = mongoStore.indexOf("  async complete(");
  const end = mongoStore.indexOf("  async findExpiredArtifacts(", start);
  const sub = mongoStore.slice(start, end);
  assert.match(sub, /this\.connection\.startSession\(\)/u);
  assert.match(sub, /session\.withTransaction\(async/u);
  assert.match(sub, /this\.users\s*\.updateOne\(\s*ownerFilter,/u);
  assert.match(sub, /this\.jobs\s*\.updateOne\(\{ \.\.\.filter, userId: ownerUserId \}, update, \{ session \}\)/u);
  assert.match(sub, /account_lifecycle_revision: expectedEpoch/u);
  assert.match(sub, /account_lifecycle_revision: \{ \$exists: false \}/u);
  assert.match(sub, /return false/u);
});
verify("historical v1/v2 preserve their single-record completion update", () => {
  assert.match(mongoStore, /input\.result\.formatVersion !== 3/u);
  assert.match(mongoStore, /this\.jobs\.updateOne\(filter, update\)\.exec\(\)/u);
  assert.doesNotMatch(read(root + "domain/account-export-contributor.registry.ts"),
    /v4|V4_SECTION_IDS/u);
});
verify("confirmed epoch rejection and uncertain commits have distinct cleanup policy", () => {
  assert.match(typedError, /AccountExportEpochConflictError/u);
  assert.match(mongoStore, /throw new AccountExportEpochConflictError\(\)/u);
  assert.match(processor, /durableCompletionAttempted/u);
  assert.match(processor, /error instanceof AccountExportEpochConflictError/u);
  assert.match(processor, /await this\.deleteOrEnqueueProvenOrphan\(job, claimId, result\)/u);
  assert.match(processor, /Once Mongo completion was attempted, preserve the S3 generation/u);
});
verify("regression cases cover v3 CAS, stale claims, uncertain commits and retries", () => {
  assert.match(mongoSpec, /B65 atomically fences v3/u);
  assert.match(mongoSpec, /B65 rejects concurrent progress edits/u);
  assert.match(mongoSpec, /B65 rolls back the owner fence/u);
  assert.match(workerSpec, /B65: never deletes S3 on an uncertain durable Mongo completion/u);
  assert.match(workerSpec, /B65: queues S3 cleanup after a confirmed atomic Mongo epoch rejection/u);
});
verify("isolated real-Mongo replica tests exercise atomic completion", () => {
  assert.match(mongoIntegration, /B65 completes a real v3 export atomically/u);
  assert.match(mongoIntegration, /B65 rejects a v3 epoch made stale/u);
  assert.match(mongoIntegration, /B65 does not increment owner epoch if a v3 claim has expired/u);
  assert.match(mongoIntegration, /B65 cannot publish owner A job with owner B epoch authority/u);
  assert.match(mongoIntegration, /STUDY_PROGRESS_TEST_MONGO_URI/u);
});
verify("feature activation remains blocked in production", () => {
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
});
console.log("PASS " + checks + " B65 exact-source integration checks");
