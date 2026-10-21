import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url));
const text = (path) => read(path).toString("utf8");
const manifest = JSON.parse(
  text("scripts/integration/b182-study-journey-sources.json"),
);

assert.equal(manifest.version, 1);
assert.equal(
  manifest.baseSecurityCommit,
  "adcbd25c40f586803e4be59c4cbfae7e400200fd",
);
assert.equal(manifest.sources.length, 32);
assert.deepEqual(
  [...new Set(manifest.sources.map((entry) => entry.pr))],
  [509, 511, 514, 515],
);

// B185 intentionally extends exactly two source blobs from PR #509.
// Keep their original SHA provenance in the manifest; require every other
// source blob to remain byte-identical, and detect undocumented changes.
const overlays = new Set([
  "apps/web/src/features/search/SearchSaveAction.tsx",
  "scripts/test-web-search-contract.mjs",
]);
let unchangedSources = 0;
let verifiedOverlays = 0;

const paths = new Set();
for (const source of manifest.sources) {
  assert.match(source.path, /^(apps\/web\/|docs\/product\/|scripts\/|\.github\/)/u);
  assert.match(source.blobSha, /^[0-9a-f]{40}$/u);
  assert.match(source.head, /^[0-9a-f]{40}$/u);
  assert.equal(paths.has(source.path), false, "No file may be overwritten by another PR");
  paths.add(source.path);
  const bytes = read(source.path);
  const blobHash = createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
  if (overlays.has(source.path)) {
    assert.equal(source.pr, 509, "Only PR #509 search actions may be extended");
    assert.notEqual(
      blobHash,
      source.blobSha,
      `B185 extension ${source.path} unexpectedly replaced by original`,
    );
    verifiedOverlays++;
  } else {
    assert.equal(
      blobHash,
      source.blobSha,
      `Source drift in ${source.path} from PR #${source.pr}`,
    );
    unchangedSources++;
  }
}

assert.equal(unchangedSources, 30);
assert.equal(verifiedOverlays, overlays.size, "Every intended B185 overlay must be tracked");

const search = text("apps/web/src/pages/Search.tsx");
const searchAction = text("apps/web/src/features/search/SearchSaveAction.tsx");
const kits = text("apps/web/src/pages/StudyKits.tsx");
const kitFinder = text("apps/web/src/features/study/StudyKitResourceSearch.tsx");
const resource = text("apps/web/src/pages/Resources.tsx");
const resourceHandoff = text(
  "apps/web/src/features/study/ResourceStudyHandoff.tsx",
);
const planner = text("apps/web/src/pages/StudySession.tsx");
const planFinder = text("apps/web/src/features/study/StudyPlanMaterialFinder.tsx");
const handoffTest = text("scripts/test-web-study-handoff-integration.mjs");
const globalVerify = text(".github/workflows/ci.yml");
const frozenLock = text("pnpm-lock.yaml");

assert.match(search, /<SearchSaveAction/u);
assert.match(searchAction, /resourcesApi\.save\(/u);
assert.match(searchAction, /resourcesApi\.unsave\(/u);
assert.match(searchAction, /Reintentar quitar/u);
assert.match(kits, /<StudyKitResourceSearch/u);
assert.match(kitFinder, /resourcesApi\.search\(/u);
assert.match(kitFinder, /useAsyncAuthorityFence/u);
assert.match(resource, /<ResourceStudyHandoff/u);
assert.match(resourceHandoff, /resourcesApi\.get\(/u);
assert.match(resourceHandoff, /searchApi\.contextual\(/u);
assert.match(resourceHandoff, /createStudyHandoff\(/u);
assert.match(planner, /<StudyPlanMaterialFinder/u);
assert.match(planFinder, /resourcesApi\.search\(/u);
assert.match(planFinder, /communityApi\.questions\(/u);
assert.match(planFinder, /communityApi\.question\(/u);
assert.match(planFinder, /resourcesApi\.get\(/u);
assert.match(planner, /STUDY_SESSION_MAX_MINUTES/u);
assert.match(handoffTest, /resourceToStudyHandoffPlan/u);
assert.match(handoffTest, /inspectStudyHandoff/u);
assert.doesNotMatch(
  searchAction + kitFinder + resourceHandoff + planFinder,
  /localStorage|sessionStorage|indexedDB/u,
);
assert.match(globalVerify, /run: pnpm audit --prod --audit-level high/u);
assert.match(globalVerify, /runs-on: ubuntu-22\.04/u);
assert.match(globalVerify, /node scripts\/ci\/check-mongo-kernel\.mjs/u);
assert.match(globalVerify, /pnpm test:auth-browser-e2e/u);
assert.match(frozenLock, /^  follow-redirects@1\.16\.1:/mu);
assert.doesNotMatch(frozenLock, /follow-redirects@1\.16\.0/u);

console.log(
  JSON.stringify({
    event: "b182.study_security.integration",
    status: "SOURCE_AND_FLOW_CONTRACT_PASS",
    originalSourceRecords: manifest.sources.length,
    byteIdenticalSourceFiles: unchangedSources,
    documentedExtensions: verifiedOverlays,
    studentFlows: [
      "search-to-save",
      "subject-kit-finder",
      "resource-to-planner",
      "planner-resources-and-qa",
    ],
    productionAuditRequired: true,
    runtimeBrowserAcceptanceRequired: true,
    releaseAuthorized: false,
  }),
);
