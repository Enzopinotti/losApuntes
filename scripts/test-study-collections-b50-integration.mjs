import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (relative) =>
  readFileSync(new URL("../" + relative, import.meta.url), "utf8");

const store = source("apps/api/src/study-collections/mongo/mongo-study-collection.store.ts");
const spec = source("apps/api/src/study-collections/mongo/mongo-study-collection.store.spec.ts");
const mongoSpec = source("apps/api/src/study-collections/mongo/study-collection-lifecycle.mongo-int.spec.ts");
const lifecycle = source("apps/api/src/data-lifecycle/mongo/mongo-account-lifecycle.store.ts");
const guard = source("apps/api/src/study-collections/study-collections-feature.guard.ts");
const env = source("apps/api/src/config/runtime-environment.ts");
const exportService = source("apps/api/src/data-lifecycle/domain/account-export.service.ts");

function section(text, name, next) {
  const start = text.indexOf(name);
  const end = text.indexOf(next, start);
  assert.ok(start >= 0 && end > start, `Missing method: ${name}`);
  return text.slice(start, end);
}

const txn = section(store, "private async withActiveOwnerTransaction", "async create(");
assert.match(txn, /startSession\(\)/u);
assert.match(txn, /session\.withTransaction\(async/u);
assert.match(txn, /_id: ownerUserId/u);
assert.match(txn, /account_status: 'active'/u);
assert.match(txn, /account_lifecycle_revision: 1/u);
assert.match(txn, /\{ new: false, session \}/u);
assert.match(txn, /STUDY_COLLECTION_ACCOUNT_INACTIVE/u);
assert.match(txn, /value = await mutate\(session\)/u);
assert.match(txn, /session\.endSession\(\)/u);

const methods = [
  ["async create(", "async list("],
  ["async updateOwned(", "async addResource("],
  ["async addResource(", "async removeResource("],
  ["async removeResource(", "async deleteOwned("],
  ["async deleteOwned(", "\n}\n"],
];
for (const [start, end] of methods) {
  const code = section(store, start, end);
  assert.match(
    code,
    /this\.withActiveOwnerTransaction\(/u,
    `Mutation ${start} bypasses account lifecycle authorization`,
  );
}
for (const [start, end] of methods.slice(1)) {
  const code = section(store, start, end);
  assert.match(code, /\{[^}]*session[^}]*\}/u);
}
assert.match(store, /\.session\(session\)/u);
assert.match(spec, /rejects \$label for a closed owner/u);
assert.match(spec, /serializes \$label via the same owner-revision/u);
assert.match(spec, /fallbacks inside the same session/u);
assert.match(spec, /closes the session when Mongo rejects/u);

assert.match(mongoSpec, /STUDY_COLLECTIONS_TEST_MONGO_URI/u);
assert.match(mongoSpec, /const localHosts = new Set/u);
assert.match(mongoSpec, /uniqueDbName =/u);
assert.match(mongoSpec, /connection\.dropDatabase\(\)/u);
assert.match(mongoSpec, /new MongoStudyCollectionStore\(/u);
assert.match(mongoSpec, /new MongoAccountLifecycleStore\(/u);
assert.match(mongoSpec, /isWritablePrimary/u);
assert.match(mongoSpec, /refuses every mutation when account closure wins first/u);
assert.match(mongoSpec, /never resurrects a collection when creation and closure/u);
assert.match(mongoSpec, /deletes only the closing owner/u);
assert.match(mongoSpec, /rolls back both closure and collection deletion/u);
assert.match(mongoSpec, /it\('commits all five mutation paths/u);

assert.match(lifecycle, /deleteMany\(\{ ownerUserId: input\.userId \}, \{ session \}\)/u);
assert.match(guard, /STUDY_COLLECTIONS_ENABLED/u);
assert.match(env, /'STUDY_COLLECTIONS_ENABLED',\s*false/u);
assert.match(exportService, /this\.collections\.hasOwnedCollections\(userId\)/u);
console.log("B50: lifecycle serialization integration assertions PASS");
