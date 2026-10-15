import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const domain = "apps/api/src/data-lifecycle/";
const service = source(domain + "domain/account-export.service.ts");
const tests = source(domain + "domain/account-export.service.spec.ts");
const contributor = source(domain + "contributors/account-export-study-progress.contributor.ts");
const contributorTests = source(
  domain + "contributors/account-export-study-progress.contributor.spec.ts",
);
const mongo = source("apps/api/src/study-progress/mongo/study-progress.mongo-int.spec.ts");
const registry = source(domain + "domain/account-export-contributor.registry.ts");
const config = source("apps/api/src/config/runtime-environment.ts");

const requestStart = service.indexOf("  async request(");
const nextMethod = service.indexOf("  private async requiredExportVersion(", requestStart);
assert.ok(requestStart >= 0 && nextMethod > requestStart);
const request = service.slice(requestStart, nextMethod);
const first = request.indexOf("await this.requiredExportVersion(userId)");
const job = request.indexOf("await this.store.requestActive(");
const second = request.indexOf(
  "const currentRequiredVersion = await this.requiredExportVersion(userId)",
);
const guard = request.indexOf("currentRequiredVersion > result.job.formatVersion");
assert.ok(first >= 0 && job > first && second > job && guard > second,
  "B63 must check version both before and after durable job upsert");
assert.match(request, /ACCOUNT_EXPORT_LEGACY_JOB_ACTIVE/u);
assert.match(request, /!\[1, 2, 3\]\.includes\(result\.job\.formatVersion\)/u);

for (const fragment of [
  "B63: rejects a v1 job", "B63: rejects a v2 job",
  "B63: fails closed when the post-upsert",
  "B63: permits replay of a higher-version",
]) assert.ok(tests.includes(fragment), fragment);

assert.match(contributor, /const plan: AccountExportRecord/u);
assert.match(contributor, /tasks: row\.plan\.tasks\.map/u);
assert.match(contributor, /plan,/u);
assert.doesNotMatch(contributor, /plan: row\.plan,/u);
assert.match(contributorTests, /projects portable tasks explicitly/u);
assert.match(mongo, /assembles an owner-only v3 JSON from real Mongo records/u);
assert.match(mongo, /createHash\('sha256'\)/u);
assert.match(mongo, /bytes\)\.not\.toContain\(otherSubject\)/u);

assert.match(registry, /ACCOUNT_EXPORT_V3_SECTION_IDS/u);
assert.match(config, /STUDY_PROGRESS_ENABLED must remain false in production/u);
console.log("B63 post-upsert version fence, strict JSON projection and owner-only acceptance contracts PASS");
