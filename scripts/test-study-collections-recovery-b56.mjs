import assert from "node:assert/strict";
import {
  inspectCollectionHealth,
  repairMissingReferences,
  CollectionRecoveryError,
} from "../apps/web/src/features/study-collections/collectionRecovery.mjs";

const collectionId = "11111111-1111-4111-8111-111111111111";
const ids = Array.from({ length: 52 }, (_, i) =>
  `22222222-2222-4222-8222-${String(i + 1).padStart(12, "0")}`);
let checks = 0;
function equal(actual, expected) {
  checks += 1;
  assert.deepEqual(actual, expected);
}
async function rejects(action, code) {
  checks += 1;
  await assert.rejects(action, (error) =>
    error instanceof CollectionRecoveryError &&
    error.code === code);
}
async function failWith(action, message) {
  checks += 1;
  await assert.rejects(action, (error) =>
    error instanceof CollectionRecoveryError &&
    error.failure?.message === message);
}

function apiFor({ initialIds = ids, inaccessible = [ids[0], ids[30]], revision = 5 } = {}) {
  const read = [];
  const removed = [];
  const removeRevisions = [];
  const pages = [];
  let rev = revision;
  let current = initialIds.slice();
  const denied = new Set(inaccessible);
  return {
    read, removed, removeRevisions, pages, denied,
    async get() {
      return { collection: { id: collectionId, resourceCount: current.length, revision: rev } };
    },
    async resources(_, cursor) {
      const start = cursor ? Number(cursor) : 0;
      pages.push(start);
      const slice = current.slice(start, start + 25);
      return {
        revision: rev,
        items: slice.map((resourceId) => ({
          resourceId,
          resource: denied.has(resourceId) ? null : { id: resourceId },
        })),
        nextCursor: start + slice.length < current.length
          ? String(start + slice.length)
          : null,
      };
    },
    async readResource(resourceId) {
      read.push(resourceId);
      if (denied.has(resourceId)) {
        throw Object.assign(new Error("Not available"), { status: 404 });
      }
      return { resource: { id: resourceId } };
    },
    async remove(_, resourceId, _signal, expectedRevision) {
      removeRevisions.push(expectedRevision);
      if (expectedRevision !== rev) {
        throw Object.assign(new Error("STUDY_COLLECTION_REVISION_CONFLICT"), {
          code: "STUDY_COLLECTION_REVISION_CONFLICT", status: 409,
        });
      }
      removed.push(resourceId);
      current = current.filter((id) => id !== resourceId);
      rev += 1;
      return { collection: { id: collectionId, revision: rev } };
    },
    changeRevision() { rev += 1; },
    current() { return current.slice(); },
  };
}

const a = apiFor();
const seen = [];
const complete = await inspectCollectionHealth(collectionId, a, undefined, (p) => seen.push(p));
equal(complete.total, 52);
equal(complete.inspected, 52);
equal(complete.accessible, 50);
equal(complete.missingIds, [ids[0], ids[30]]);
equal(complete.pages, 3);
equal(a.pages, [0, 25, 50]);
equal(seen.length, 3);
equal(a.removed.length, 0);

const changed = apiFor();
let reads = 0;
const staleApi = {
  ...changed,
  async resources(id, cursor) {
    const page = await changed.resources(id, cursor);
    if (++reads === 1) changed.changeRevision();
    return page;
  },
};
await failWith(
  inspectCollectionHealth(collectionId, staleApi),
  "RECOVERY_REVISION_OR_PAGE_INVALID",
);
equal(changed.removed.length, 0);

const loopApi = {
  async get() {
    return { collection: { id: collectionId, resourceCount: 2, revision: 1 } };
  },
  async resources() {
    return {
      revision: 1, items: [{ resourceId: ids[0], resource: null }],
      nextCursor: "same",
    };
  },
};
await failWith(inspectCollectionHealth(collectionId, loopApi), "RECOVERY_CURSOR_LOOP");

const incompleteApi = {
  async get() {
    return { collection: { id: collectionId, resourceCount: 2, revision: 1 } };
  },
  async resources() {
    return {
      revision: 1, items: [{ resourceId: ids[0], resource: null }],
      nextCursor: null,
    };
  },
};
await failWith(inspectCollectionHealth(collectionId, incompleteApi), "RECOVERY_STALE_SCAN");

const revoked = apiFor();
const report = await inspectCollectionHealth(collectionId, revoked);
revoked.denied.delete(ids[30]);
const progress = [];
const repair = await repairMissingReferences(report, revoked, undefined,
  (p) => progress.push(p));
equal(repair.processed, 2);
equal(repair.removed, 1);
equal(repair.restored, 1);
equal(repair.revision, 6);
equal(revoked.removed, [ids[0]]);
equal(revoked.removeRevisions, [5]);
equal(revoked.read, [ids[0], ids[30]]);
equal(progress.length, 2);
equal(report.missingIds, [ids[0], ids[30]]);

const race = apiFor();
const beforeRace = await inspectCollectionHealth(collectionId, race);
race.changeRevision();
await failWith(repairMissingReferences(beforeRace, race), "RECOVERY_STALE_REVISION");
equal(race.removed, []);
equal(race.read, []);

const changing = apiFor();
const beforeChange = await inspectCollectionHealth(collectionId, changing);
let changedDuring = false;
const changingApi = {
  ...changing,
  async remove(id, rid, signal, expectedRevision) {
    const response = await changing.remove(id, rid, signal, expectedRevision);
    if (!changedDuring) {
      changedDuring = true;
      changing.changeRevision();
    }
    return response;
  },
};
let partial;
try { await repairMissingReferences(beforeChange, changingApi); }
catch (e) { partial = e; }
checks += 1;
assert.ok(partial instanceof CollectionRecoveryError);
equal(partial.progress.removed, 1);
equal(partial.progress.processed, 1);
equal(changing.removed, [ids[0]]);

// An edit can race after the GET but before Mongo's conditional DELETE.
const writeConflict = apiFor();
const conflictReport = await inspectCollectionHealth(collectionId, writeConflict);
const raceInMongo = {
  ...writeConflict,
  async remove(id, rid, signal, expectedRevision) {
    writeConflict.changeRevision();
    return writeConflict.remove(id, rid, signal, expectedRevision);
  },
};
let conflict;
try { await repairMissingReferences(conflictReport, raceInMongo); }
catch (error) { conflict = error; }
checks += 1;
assert.ok(conflict instanceof CollectionRecoveryError);
equal(conflict.progress.removed, 0);
equal(conflict.progress.processed, 0);
equal(writeConflict.removed, []);
equal(writeConflict.removeRevisions, [5]);

// The server may find access restored even if the immediately preceding
// client read saw 404. Server-side veto always wins.
const restoredOnServer = apiFor();
const restoredReport = await inspectCollectionHealth(collectionId, restoredOnServer);
const lateRestoration = {
  ...restoredOnServer,
  async remove() {
    throw Object.assign(new Error("STUDY_COLLECTION_REFERENCE_ACCESSIBLE"), {
      code: "STUDY_COLLECTION_REFERENCE_ACCESSIBLE", status: 409,
    });
  },
};
let veto;
try { await repairMissingReferences(restoredReport, lateRestoration); }
catch (error) { veto = error; }
checks += 1;
assert.ok(veto instanceof CollectionRecoveryError);
equal(veto.progress.removed, 0);
equal(restoredOnServer.removed, []);

const network = apiFor();
const networkReport = await inspectCollectionHealth(collectionId, network);
const failure = {
  ...network,
  async readResource() {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  },
};
await rejects(repairMissingReferences(networkReport, failure), "RECOVERY_REPAIR_INCOMPLETE");
equal(network.removed, []);

const canceled = apiFor();
const canceledReport = await inspectCollectionHealth(collectionId, canceled);
const signal = { aborted: false };
const canceledApi = {
  ...canceled,
  async readResource(id) {
    signal.aborted = true;
    return { resource: { id } };
  },
};
await rejects(repairMissingReferences(canceledReport, canceledApi, signal), "RECOVERY_ABORTED");
equal(canceled.removed, []);

const empty = apiFor({ initialIds: [], inaccessible: [] });
const emptyReport = await inspectCollectionHealth(collectionId, empty);
equal(emptyReport.total, 0);
equal(emptyReport.missingIds, []);
const emptyRepair = await repairMissingReferences(emptyReport, empty);
equal(emptyRepair.removed, 0);

checks += 1;
await assert.rejects(inspectCollectionHealth("invalid", a), /RECOVERY_ID_INVALID/u);
checks += 1;
await assert.rejects(repairMissingReferences({
  ...complete, missingIds: [ids[0], ids[0]],
}, a), /RECOVERY_REPORT_INVALID/u);
checks += 1;
await assert.rejects(repairMissingReferences({
  ...complete, inspected: 30,
}, a), /RECOVERY_REPORT_INVALID/u);

console.log(`PASS B56 collection health / recoverability: ${checks} assertions`);
