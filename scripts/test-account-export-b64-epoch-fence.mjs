import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const api = "apps/api/src/";
const users = read(api + "users/users.service.ts");
const progress = read(api + "study-progress/study-progress.service.ts");
const service = read(api + "data-lifecycle/domain/account-export.service.ts");
const assembler = read(api + "data-lifecycle/domain/account-export-assembler.ts");
const processor = read(api + "data-lifecycle/domain/account-export-processor.ts");
const unit = read(api + "data-lifecycle/domain/account-export-versioning.spec.ts");
const mongo = read(api + "study-progress/mongo/study-progress.mongo-int.spec.ts");
const worker = read(api + "data-lifecycle/domain/account-export-processor.spec.ts");
const config = read(api + "config/runtime-environment.ts");

const assertHas = (file, part, description) =>
  assert.ok(file.includes(part), description);

assertHas(progress, "$inc: { account_lifecycle_revision: 1 }",
  "progress writes must monotonically increase owner epoch");
assertHas(users, ".select('+account_lifecycle_revision')",
  "reader must explicitly select private owner mutation epoch");
assertHas(users, "account_status: 'active'",
  "closed/restricted users cannot satisfy export owner epoch");
assertHas(service, "getStudyProgressExportEpoch(userId)",
  "export service must obtain owner epoch through UsersService");
assertHas(service, "Study progress changed during account export",
  "mutations must fail closed");

const write = assembler.slice(assembler.indexOf("  private async writeJsonForVersion("));
const capture = write.indexOf("captureStudyProgressExportEpoch(userId)");
const firstWrite = write.indexOf("await writeChunk(");
const recheck = write.indexOf("assertStudyProgressExportEpoch(");
const finalCommit = write.indexOf("await sink.commit(result)");
assert.ok(capture >= 0 && firstWrite > capture &&
  recheck > firstWrite && finalCommit > recheck,
"epoch must be captured before stream and checked before publish");
assertHas(write, "version === 3",
  "epoch is only required for progress-bearing v3 jobs");
assertHas(write, "await sink.abort()",
  "failed export must abort staged bytes");

assertHas(unit, "B64: aborts v3 if owner progress changes",
  "unit regression for changed owner progress");
assertHas(unit, "B64: never probes new private epochs for legacy v1/v2 jobs",
  "historical formats must stay unchanged");
assertHas(mongo, "B64 rejects a real Mongo progress mutation during v3 assembly",
  "real Mongo mutation acceptance must exist");
assertHas(worker, "B64 retries a stale v3 progress snapshot",
  "retry behavior must be covered");
assertHas(worker, "B64 exhausts stale v3 snapshots",
  "retry exhaustion must not publish");
assertHas(processor, "EXPORT_ASSEMBLY_RETRY",
  "stale read should use the existing worker retry contract");
assertHas(config, "STUDY_PROGRESS_ENABLED must remain false in production",
  "production release hold must remain");
console.log("B64 owner epoch prepublish fence and retry contracts: PASS");
