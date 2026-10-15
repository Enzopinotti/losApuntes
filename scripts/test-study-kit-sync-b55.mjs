import assert from "node:assert/strict";
import {
  syncStudyKitToCollection,
  StudyKitSyncError,
  validateStudyKitSyncInput,
} from "../apps/web/src/features/study-collections/studyKitSync.mjs";

const subjectId = "11111111-1111-4111-8111-111111111111";
const otherSubject = "22222222-2222-4222-8222-222222222222";
const kitId = "33333333-3333-4333-8333-333333333333";
const collectionId = "44444444-4444-4444-8444-444444444444";
const ids = [
  "55555555-5555-4555-8555-555555555555",
  "66666666-6666-4666-8666-666666666666",
  "77777777-7777-4777-8777-777777777777",
  "88888888-8888-4888-8888-888888888888",
];
const kit = Object.freeze({
  id: kitId,
  title: "Segundo parcial",
  notes: "Apuntes seleccionados",
  resourceIds: Object.freeze(ids.slice()),
});
const fresh = { aborted: false };
const resource = (id, sub = subjectId) => ({
  resource: { id, academic: { subject: { id: sub } } },
});
let checks = 0;
function check(actual, expected) {
  checks += 1;
  assert.deepEqual(actual, expected);
}

const plan = validateStudyKitSyncInput(kit, subjectId);
check(plan.operationKey, kitId);
check(plan.resourceIds, ids);
for (const invalid of [
  { ...kit, id: "bad" },
  { ...kit, title: " " },
  { ...kit, notes: "x".repeat(501) },
  { ...kit, resourceIds: [ids[0], ids[0]] },
  { ...kit, resourceIds: Array.from({ length: 25 }, () => ids[0]) },
  { ...kit, resourceIds: ["bad"] },
]) {
  checks += 1;
  assert.throws(() => validateStudyKitSyncInput(invalid, subjectId));
}
checks += 1;
assert.throws(() => validateStudyKitSyncInput(kit, "bad"));
checks += 1;
await assert.rejects(syncStudyKitToCollection(
  { kit, subjectId }, {}, fresh,
), /STUDY_KIT_SYNC_API_INVALID/u);

const calls = [];
const updates = [];
const main = await syncStudyKitToCollection({ kit, subjectId }, {
  async createCollection(input) {
    calls.push(["create", input]);
    return { collection: { id: collectionId } };
  },
  async readResource(id) {
    calls.push(["get", id]);
    if (id === ids[1]) throw Object.assign(new Error("private"), { status: 403 });
    if (id === ids[2]) return resource(id, otherSubject);
    return resource(id);
  },
  async addResource(cid, rid) {
    calls.push(["add", cid, rid]);
  },
}, fresh, (v) => updates.push(v));
check(main, { collectionId, total: 4, linked: 2, skipped: 2 });
check(calls[0], ["create", {
  operationKey: kitId,
  title: kit.title,
  description: kit.notes,
}]);
check(calls.filter((x) => x[0] === "add"), [
  ["add", collectionId, ids[0]],
  ["add", collectionId, ids[3]],
]);
check(updates.length, 5);
check(updates[0], { collectionId, total: 4, linked: 0, skipped: 0 });
check(updates.at(-1), main);
check(kit.resourceIds, ids);

const stored = { id: collectionId, linked: new Set() };
const createKeys = [];
let shouldFail = true;
const resumable = {
  async createCollection(input) {
    createKeys.push(input.operationKey);
    return { collection: stored };
  },
  async readResource(id) { return resource(id); },
  async addResource(_, id) {
    if (shouldFail && id === ids[1]) {
      shouldFail = false;
      throw new Error("transient network failure");
    }
    stored.linked.add(id);
  },
};
let incomplete;
try {
  await syncStudyKitToCollection({ kit, subjectId }, resumable, fresh);
} catch (error) {
  incomplete = error;
}
checks += 1;
assert.ok(incomplete instanceof StudyKitSyncError);
check(incomplete.progress, { collectionId, total: 4, linked: 1, skipped: 0 });
check([...stored.linked], [ids[0]]);
const retry = await syncStudyKitToCollection({ kit, subjectId }, resumable, fresh);
check(retry, { collectionId, total: 4, linked: 4, skipped: 0 });
check([...stored.linked], ids);
check(createKeys, [kitId, kitId]);

const canceled = { aborted: false };
let wrote = 0;
let aborted;
try {
  await syncStudyKitToCollection({ kit, subjectId }, {
    async createCollection() { return { collection: { id: collectionId } }; },
    async readResource(id) {
      canceled.aborted = true;
      return resource(id);
    },
    async addResource() { wrote += 1; },
  }, canceled);
} catch (error) { aborted = error; }
checks += 1;
assert.ok(aborted instanceof StudyKitSyncError);
check(aborted.message, "STUDY_KIT_SYNC_ABORTED");
check(wrote, 0);

let failClosed;
try {
  await syncStudyKitToCollection({ kit, subjectId }, {
    async createCollection() { return { collection: { id: collectionId } }; },
    async readResource(id) { return resource(id); },
    async addResource() { throw Object.assign(new Error("account forbidden"), { status: 403 }); },
  }, fresh);
} catch (error) { failClosed = error; }
checks += 1;
assert.ok(failClosed instanceof StudyKitSyncError);
check(failClosed.progress.linked, 0);
check(failClosed.progress.collectionId, collectionId);

const empty = await syncStudyKitToCollection({
  kit: { ...kit, resourceIds: [] }, subjectId,
}, {
  async createCollection() { return { collection: { id: collectionId } }; },
  async readResource() { throw new Error("should not be called"); },
  async addResource() { throw new Error("should not be called"); },
}, fresh);
check(empty, { collectionId, total: 0, linked: 0, skipped: 0 });

const missing = await syncStudyKitToCollection({
  kit: { ...kit, resourceIds: [ids[0]] }, subjectId,
}, {
  async createCollection() { return { collection: { id: collectionId } }; },
  async readResource() { throw Object.assign(new Error("not found"), { status: 404 }); },
  async addResource() { throw new Error("must skip"); },
}, fresh);
check(missing, { collectionId, total: 1, linked: 0, skipped: 1 });

console.log(`PASS B55 portable → persistent sync: ${checks} assertions`);
