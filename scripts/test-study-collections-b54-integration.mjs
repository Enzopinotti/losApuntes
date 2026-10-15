import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");

const service = read("apps/api/src/study-collections/domain/study-collection.service.ts");
const serviceTests = read("apps/api/src/study-collections/domain/study-collection.service.spec.ts");
const mongoTests = read("apps/api/src/study-collections/mongo/study-collection-lifecycle.mongo-int.spec.ts");
const manifest = read("scripts/lib/study-mongo-acceptance.mjs");
const reportTests = read("scripts/test-study-collections-b52-gate.mjs");
const b52 = read("scripts/test-study-collections-b52-integration.mjs");
const b53 = read("scripts/test-study-collections-b53-integration.mjs");
const config = read("apps/api/src/config/runtime-environment.ts");
const closure = read("apps/api/src/data-lifecycle/mongo/mongo-account-lifecycle.store.ts");

function section(a, b) {
  const start = service.indexOf(a);
  const end = service.indexOf(b, start);
  assert.ok(start >= 0 && end > start, "Cursor boundary missing");
  return service.slice(start, end);
}
const cursor = section("function itemsCursor(", "function projection(");
assert.match(service, /function parseCursor\(value\?: string\): Record<string, unknown> \| null \{/u);
assert.match(service, /if \(value === undefined\) return null/u);
assert.match(cursor, /!Number\.isSafeInteger\(parsed\.revision\)/u);
assert.match(cursor, /STUDY_COLLECTION_CURSOR_STALE/u);
assert.match(cursor, /if \(\(parsed\.index as number\) >= collection\.resourceIds\.length\)/u);
assert.ok(
  cursor.indexOf("parsed.revision !== collection.revision") <
    cursor.indexOf("parsed.index as number) >= collection.resourceIds.length"),
  "Old cursor index must NOT mask the stale revision conflict",
);

assert.match(serviceTests, /recoverable 409 when removing resources shrinks/u);
assert.match(serviceTests, /STUDY_COLLECTION_CURSOR_STALE/u);
assert.match(serviceTests, /rejects malformed same-revision indexes/u);
assert.match(serviceTests, /service\.list\(ownerId, 1, ''\)/u);

assert.match(mongoTests, /async function committedClosureAfterRace/u);
assert.match(mongoTests, /for \(let attempt = 0; attempt < 3; attempt \+= 1\)/u);
assert.match(mongoTests, /Concurrent account closure never committed/u);
assert.match(mongoTests, /committedClosureAfterRace\(userId, closeResult\)/u);
assert.match(mongoTests, /committedClosureAfterRace\(userId, closure\)/u);
assert.match(mongoTests, /returns stale revision conflict after concurrent removal shrinks a resource page/u);
assert.match(mongoTests, /new StudyCollectionService\(/u);
assert.match(mongoTests, /expect\(documents\)\.toBe\(0\)/u);

assert.match(reportTests, /REQUIRED_STUDY_MONGO_TEST_NAMES\.length, 13/u);
assert.match(manifest, /returns stale revision conflict after concurrent removal shrinks a resource page/u);
assert.match(manifest, /actual\.size !== EXPECTED\.length/u);
assert.match(b52, /committedClosureAfterRace/u);
assert.match(b52, /numPassedTests !== EXPECTED/u);
assert.match(b53, /REQUIRED_STUDY_MONGO_TEST_NAMES\\.length, 13/u);
assert.match(closure, /deleteMany\(\{ ownerUserId: input\.userId \}, \{ session \}\)/u);
assert.match(config, /'STUDY_COLLECTIONS_ENABLED',\s*false/u);

console.log("B54 cursor, 13-case gate and committed closure source contracts PASS");
