import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");

const kits = read("apps/web/src/pages/StudyKits.tsx");
const session = read("apps/web/src/pages/StudySession.tsx");
const v1Spec = read("apps/api/src/data-lifecycle/domain/account-export-assembler.spec.ts");
const controllerSpec = read("apps/api/src/data-lifecycle/account-export.controller.spec.ts");
const registry = read("apps/api/src/data-lifecycle/domain/account-export-contributor.registry.ts");
const assembler = read("apps/api/src/data-lifecycle/domain/account-export-assembler.ts");
const types = read("apps/api/src/data-lifecycle/domain/account-export.types.ts");

const manifestMatch = registry.match(
  /ACCOUNT_EXPORT_V1_SECTION_IDS = Object\.freeze\(\[([\s\S]*?)\] as const\);/u,
);
assert.ok(manifestMatch, "Public v1 manifest declaration must remain explicit");
const v1Ids = [...manifestMatch[1].matchAll(/'([A-Za-z.]+)'/gu)]
  .map((match) => match[1]);
assert.equal(v1Ids.length, 30, "v1 account export must have exactly 30 sections");
assert.equal(new Set(v1Ids).size, 30, "v1 section IDs must be unique");
assert.deepEqual(v1Ids, [...v1Ids].sort(), "v1 format section order must not drift");
assert.ok(v1Ids.includes("account"));
assert.ok(v1Ids.includes("profile"));
assert.ok(v1Ids.includes("resources.saved"));
assert.ok(!v1Ids.includes("study.collections"));

assert.match(registry, /ACCOUNT_EXPORT_V2_SECTION_IDS/u);
assert.match(registry, /'study\.collections'/u);
assert.match(types, /ACCOUNT_EXPORT_FORMAT_VERSION = 1;/u);
assert.match(assembler, /accountExportSectionIds\(version\)/u);
assert.match(assembler, /version === 3 \? this\.registry\.list\(\) : contributors/u);
assert.match(assembler, /this\.registry\.require\(id\)/u);
assert.match(assembler, /formatVersion: version/u);

const legacyFixture = v1Spec.slice(
  v1Spec.indexOf("function assemblerFor("),
  v1Spec.indexOf("function expectedV1Artifact("),
);
assert.ok(legacyFixture.length > 0);
assert.match(legacyFixture, /ACCOUNT_EXPORT_V1_SECTION_IDS\.filter\(/u);
assert.match(legacyFixture, /!provided\.has\(sectionId\)/u);
assert.match(legacyFixture, /\.\.\.emptyContributors/u);
assert.doesNotMatch(assembler, /emptyContributors/u,
  "The empty-contributor fallback is allowed only inside tests");
assert.match(v1Spec, /rejects an incomplete contributor registry/u);
assert.match(v1Spec, /expect\(sink\.commit\)\.not\.toHaveBeenCalled\(\)/u);
assert.match(v1Spec, /expectedV1Artifact\(/u);
assert.match(v1Spec, /ACCOUNT_EXPORT_V1_SECTION_IDS\.map\(/u);
assert.match(controllerSpec, /formatVersion: 99 as unknown as AccountExportFormatVersion/u);
assert.match(controllerSpec, /readObjectChunks\)\.not\.toHaveBeenCalled\(\)/u);

assert.doesNotMatch(kits, /\bnormalizeStudyKitArchive\b/u,
  "Unused archive import must not block Web typecheck");
const index = session.indexOf("¿Vaciar el borrador temporal?");
assert.ok(index > 280, "Missing destructive clear-draft handler");
const clearDraft = session.slice(index - 280, index + 350);
assert.match(clearDraft, /if \(!subjectId\) return;/u);
assert.ok(
  clearDraft.indexOf("if (!subjectId) return;") <
    clearDraft.indexOf("window.confirm("),
  "The context guard must run BEFORE the destructive confirmation",
);
assert.match(clearDraft, /emptyStudySession\(subjectId\)/u);
assert.match(session, /const subjectId = subject\?\.id \?\? null;/u);

const json = JSON.stringify({
  format: "los-apuntes-account-export",
  version: 1,
  sections: Object.fromEntries(v1Ids.map((id) => [id, []])),
});
const envelope = JSON.parse(json);
assert.equal(Object.keys(envelope.sections).length, 30);
assert.deepEqual(Object.keys(envelope.sections), v1Ids);
assert.equal(envelope.sections["study.collections"], undefined);
console.log("PASS: B51 v1 manifest and Study Web authority consolidation");
