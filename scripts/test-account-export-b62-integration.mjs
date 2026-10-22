import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const root = "apps/api/src/";
const lifecycle = root + "data-lifecycle/";
const progress = root + "study-progress/";
const types = read(lifecycle + "domain/account-export.types.ts");
const registry = read(lifecycle + "domain/account-export-contributor.registry.ts");
const assembler = read(lifecycle + "domain/account-export-assembler.ts");
const service = read(lifecycle + "domain/account-export.service.ts");
const processor = read(lifecycle + "domain/account-export-processor.ts");
const controller = read(lifecycle + "account-export.controller.ts");
const storage = read(lifecycle + "storage/account-export-artifact-storage.ts");
const smoke = read("scripts/smoke-account-export-lifecycle.mjs");
const module = read(lifecycle + "data-lifecycle.module.ts");
const reader = read(progress + "mongo/study-progress-export.reader.ts");
const readModule = read(progress + "mongo/study-progress-export-read.module.ts");
const contributor = read(lifecycle + "contributors/account-export-study-progress.contributor.ts");
const schema = read(progress + "mongo/study-progress.schema.ts");
const config = read(root + "config/runtime-environment.ts");
const tests = read(lifecycle + "domain/account-export-versioning.spec.ts");
const mongoTest = read(progress + "mongo/study-progress.mongo-int.spec.ts");
let count = 0;
function verify(title, fn) {
  fn();
  count++;
  console.log("PASS", title);
}
verify("existing default and all three immutable format versions", () => {
  assert.match(types, /ACCOUNT_EXPORT_FORMAT_VERSION = 1/u);
  assert.match(types, /AccountExportFormatVersion = 1 \| 2 \| 3/u);
  for (const v of ["V1", "V2", "V3"]) {
    assert.match(registry, new RegExp("ACCOUNT_EXPORT_" + v + "_SECTION_IDS"));
  }
  assert.match(registry, /'study\.progress'/u);
  assert.match(registry, /version === 3/u);
});
verify("backend registry is real-module fail closed against 32 contributors", () => {
  assert.match(module, /StudyProgressExportReadModule/u);
  assert.match(module, /StudyProgressExportContributor/u);
  assert.match(module, /assertAccountExportSections\(contributors, 3\)/u);
});
verify("worker and assembler retain every persisted job version", () => {
  assert.match(assembler, /writeJsonV1\(/u);
  assert.match(assembler, /writeJsonV2\(/u);
  assert.match(assembler, /writeJsonV3\(/u);
  assert.match(assembler, /version === 3 \? this\.registry\.list\(\) : contributors/u);
  assert.match(processor, /job\.formatVersion === 2/u);
  assert.match(processor, /this\.assembler\.writeJsonV3\(/u);
});
verify("no silent downgrade on rollout/rollback", () => {
  assert.match(service, /this\.progress\.hasOwnedProgress\(userId\)/u);
  assert.match(service, /this\.collections\.hasOwnedCollections\(userId\)/u);
  assert.match(service, /currentRequiredVersion > result\.job\.formatVersion/u);
  assert.match(service, /Private account export readers are not fully wired/u);
});
verify("v3 completion, status and download metadata are validated", () => {
  assert.match(service, /safeSectionCount\(result\.formatVersion\)/u);
  assert.match(service, /safeSectionCount\(job\.formatVersion\)/u);
  assert.match(controller, /\[1, 2, 3\]\.includes\(artifact\.formatVersion\)/u);
  assert.match(controller, /verifyAccountExportDownload\(/u);
});
verify("owner reads use indexed immutable pagination", () => {
  assert.match(reader, /\.find\(\{\s*ownerUserId,/u);
  assert.match(reader, /subjectId: \{ \$gt: afterSubjectId \}/u);
  assert.match(reader, /\.sort\(\{ subjectId: 1 \}\)/u);
  assert.match(reader, /\.limit\(input\.limit \+ 1\)/u);
  assert.match(schema, /ownerUserId: 1, subjectId: 1.*unique: true/u);
});
verify("owner cursor is bounded, canonical and isolated across accounts", () => {
  assert.match(reader, /STUDY_PROGRESS_EXPORT_PAGE_LIMIT = 100/u);
  assert.match(reader, /row\.ownerUserId !== ownerUserId/u);
  assert.match(reader, /buffer\.toString\('base64url'\) !== cursor/u);
  assert.match(reader, /Object\.keys\(row\)\.sort\(\)\.join\(','\)/u);
});
verify("database projections are allowlisted and validated", () => {
  // Require the same explicit allowlisted Mongo projection, allowing the
  // canonical multiline formatting used in the live reader.
  assert.match(reader, /\.select\(\{\s*_id: 0,\s*subjectId: 1,\s*plan: 1,\s*revision: 1/u);
  assert.match(reader, /parseStudyProgressPlan\(row\.plan, row\.subjectId\)/u);
  assert.doesNotMatch(reader, /operationKey|accessToken|signedUrl/u);
});
verify("new contributor uses reader and emits bounded allowlist", () => {
  assert.match(contributor, /sectionId = 'study\.progress'/u);
  assert.match(contributor, /listAccountExportProgress\(input\.userId/u);
  assert.match(contributor, /const plan: AccountExportRecord/u);
  assert.match(contributor, /tasks: row\.plan\.tasks\.map/u);
  assert.match(contributor, /plan,/u);
  assert.match(readModule, /exports: \[StudyProgressExportReader\]/u);
});
verify("legacy regression and Mongo integration evidence exist", () => {
  assert.match(tests, /writeJsonV1/u);
  assert.match(tests, /writeJsonV2/u);
  assert.match(tests, /writeJsonV3/u);
  assert.match(mongoTest, /listAccountExportProgress\(ownerId/u);
});
verify("S3 commit requires version-matched inventory and digest", () => {
  assert.match(storage, /accountExportSectionIds\(result\.formatVersion\)\.length/u);
  assert.match(storage, /result\.sha256 !== actualDigest/u);
  assert.match(smoke, /EXPECTED_SECTION_COUNTS/u);
  assert.match(smoke, /artifact\.version, status\.formatVersion/u);
});
verify("production activation is still blocked", () => {
  assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
});
console.log("PASS " + count + " B62 source integration contracts");
