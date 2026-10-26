import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

const suite = read("apps/api/src/study-collections/mongo/study-collection-lifecycle.mongo-int.spec.ts");
const runner = read("scripts/run-study-collections-mongo-acceptance.mjs");
const checker = read("scripts/lib/study-mongo-acceptance.mjs");
const gate = read("scripts/test-study-collections-b52-gate.mjs");
const flag = read("apps/api/src/config/runtime-environment.ts");
const store = read("apps/api/src/study-collections/mongo/mongo-study-collection.store.ts");
const closure = read("apps/api/src/data-lifecycle/mongo/mongo-account-lifecycle.store.ts");

assert.match(suite, /const competingMutations = \[/u);
for (const name of ["edit", "add resource", "remove resource", "delete"]) {
  assert.match(suite, new RegExp("label: '" + name + "'"));
}
assert.match(suite, /it\.each\(competingMutations\)/u);
assert.match(suite, /Promise\.allSettled\(/u);
assert.match(suite, /async function committedClosureAfterRace\(/u);
assert.match(suite, /await committedClosureAfterRace\(userId, closeResult\)/u);
assert.match(suite, /await committedClosureAfterRace\(userId, closure\)/u);
assert.match(suite, /expect\(committed\.status\)\.toBe\('closed'\)/u);
assert.match(suite, /expect\(remaining\)\.toBe\(0\)/u);
assert.match(suite, /keeps the same idempotency key and original collection/u);
assert.match(suite, /STUDY_COLLECTIONS_TEST_MONGO_URI/u);
assert.match(suite, /uniqueDbName =/u);
assert.match(suite, /connection\.dropDatabase\(\)/u);
assert.match(suite, /reportedMembers\.every/u);
assert.match(suite, /verifiedLocalReplica = true/u);
assert.match(suite, /verifiedLocalReplica &&\s*connection\?\.readyState === ConnectionStates\.connected/u);
assert.match(suite, /const runMongo = uri \? describe : describe\.skip/u);
assert.match(runner, /validateStudyMongoGateUri/u);
assert.match(runner, /validateStudyMongoJestReport/u);
assert.match(runner, /spawnSync\("pnpm"/u);
assert.match(runner, /--runTestsByPath/u);
assert.match(runner, /--outputFile/u);
assert.match(runner, /run\.status !== 0/u);
assert.match(runner, /process\.exitCode = 1/u);
assert.match(checker, /numPendingTests !== 0/u);
assert.match(checker, /numPassedTests !== EXPECTED\.length/u);
assert.match(checker, /expectedNames\.some\(\(name\) => !actual\.has\(name\)\)/u);
assert.match(checker, /assertionResults/u);
assert.match(gate, /await assert\.rejects\(/u);
assert.match(checker, /validateB89LocalMongoUri\(/u);
assert.match(suite, /directConnection: true/u);
assert.match(flag, /'STUDY_COLLECTIONS_ENABLED',\s*false/u);
assert.match(store, /withActiveOwnerTransaction\(/u);
assert.match(closure, /deleteMany\(\{ ownerUserId: input\.userId \}, \{ session \}\)/u);
console.log("B52 exact-head Mongo acceptance integration contract PASS");
