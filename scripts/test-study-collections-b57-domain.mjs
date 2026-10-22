import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../apps/api/src/study-collections/domain/study-collection.service.ts", import.meta.url), "utf8");
const begin = source.indexOf("  async removeResource(");
const end = source.indexOf("  async listResources(", begin);
assert.ok(begin >= 0 && end > begin, "The real domain method must exist");
const realMethod = source.slice(begin, end).replace(
  "    ownerUserId: string,\n    id: string,\n    resourceId: string,\n    expectedRevision?: number,",
  "    ownerUserId,\n    id,\n    resourceId,\n    expectedRevision,",
);
assert.doesNotMatch(realMethod, /expectedRevision\?: number/u);

class HttpError extends Error {
  constructor(payload) {
    super(payload.message || payload.code || "error");
    this.response = payload;
  }
}
class NotFoundException extends HttpError {}
class ForbiddenException extends HttpError {}
class ConflictException extends HttpError {}
class UnprocessableEntityException extends HttpError {}

const Probe = new Function(
  "NotFoundException", "ForbiddenException", "ConflictException",
  "UnprocessableEntityException", "projection",
  `return class Probe {
    constructor(row, mode, returned) {
      this.row = row; this.mode = mode; this.returned = returned;
      this.calls = [];
      this.store = { removeResource: async (...args) => {
        this.calls.push(["store", ...args]);
        if (this.mode === "mongoConflict") throw new ConflictException({
          code: "STUDY_COLLECTION_REVISION_CONFLICT",
        });
        return this.returned ?? this.row;
      }};
      this.resources = { get: async (...args) => {
        this.calls.push(["get", ...args]);
        if (["notFound", "mongoConflict"].includes(this.mode)) {
          throw new NotFoundException({ code: "R_NOT_FOUND" });
        }
        if (this.mode === "forbidden") {
          throw new ForbiddenException({ code: "R_FORBIDDEN" });
        }
        if (this.mode === "network") throw new Error("R_UNAVAILABLE");
        return { resource: { id: args[0] } };
      }};
    }
    async requireOwned(id, owner) {
      this.calls.push(["owner", id, owner]);
      if (owner !== "owner") throw new NotFoundException({
        code: "COL_NOT_FOUND",
      });
      return this.row;
    }
    notFound() { throw new NotFoundException({ code: "COL_NOT_FOUND" }); }
    ${realMethod}
  };`,
)(
  NotFoundException, ForbiddenException, ConflictException,
  UnprocessableEntityException,
  (row) => ({
    id: row.id, revision: row.revision,
    resourceCount: row.resourceIds.length,
  }),
);

const resourceId = "33333333-3333-4333-8333-333333333333";
const collectionId = "11111111-1111-4111-8111-111111111111";
const base = { id: collectionId, revision: 2, resourceIds: [resourceId] };

let assertions = 0;
async function check({
  name, mode, revision, row = base, returned = null,
  actor = "owner", expected, storeCalls, resourceCalls,
}) {
  const probe = new Probe(row, mode, returned);
  let got;
  try {
    const response = await probe.removeResource(
      actor, collectionId, resourceId, revision,
    );
    got = response.collection.revision;
  } catch (error) {
    got = error.response?.code || error.message;
  }
  assert.equal(got, expected, name);
  assertions += 1;
  assert.equal(
    probe.calls.filter((v) => v[0] === "store").length,
    storeCalls, `${name} - store calls`,
  );
  assertions += 1;
  assert.equal(
    probe.calls.filter((v) => v[0] === "get").length,
    resourceCalls, `${name} - Resource authority calls`,
  );
  assertions += 1;
  return probe;
}
await check({
  name: "restored access veto", mode: "accessible", revision: 2,
  expected: "STUDY_COLLECTION_REFERENCE_ACCESSIBLE",
  storeCalls: 0, resourceCalls: 1,
});
await check({
  name: "not found permits conditional deletion", mode: "notFound", revision: 2,
  returned: { ...base, revision: 3, resourceIds: [] },
  expected: 3, storeCalls: 1, resourceCalls: 1,
});
await check({
  name: "forbidden permits conditional deletion", mode: "forbidden", revision: 2,
  returned: { ...base, revision: 3, resourceIds: [] },
  expected: 3, storeCalls: 1, resourceCalls: 1,
});
await check({
  name: "stale pre-read revision", mode: "notFound", revision: 1,
  expected: "STUDY_COLLECTION_REVISION_CONFLICT",
  storeCalls: 0, resourceCalls: 0,
});
await check({
  name: "reference removed before revalidation", mode: "notFound",
  revision: 2, row: { ...base, resourceIds: [] },
  expected: "STUDY_COLLECTION_REFERENCE_CHANGED",
  storeCalls: 0, resourceCalls: 0,
});
await check({
  name: "Resource service unavailable", mode: "network", revision: 2,
  expected: "R_UNAVAILABLE", storeCalls: 0, resourceCalls: 1,
});
await check({
  name: "atomic Mongo compare and swap rejected", mode: "mongoConflict",
  revision: 2, expected: "STUDY_COLLECTION_REVISION_CONFLICT",
  storeCalls: 1, resourceCalls: 1,
});
await check({
  name: "defense against missing revision bump", mode: "notFound",
  revision: 2, returned: { ...base, revision: 2 },
  expected: "STUDY_COLLECTION_REVISION_CONFLICT",
  storeCalls: 1, resourceCalls: 1,
});
await check({
  name: "legacy unconditional delete", mode: "accessible",
  revision: undefined, expected: 2,
  storeCalls: 1, resourceCalls: 0,
});
await check({
  name: "different owner", mode: "notFound", revision: 2,
  actor: "intruder", expected: "COL_NOT_FOUND",
  storeCalls: 0, resourceCalls: 0,
});
for (const revision of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
  await check({
    name: `malformed revision ${revision}`, mode: "notFound",
    revision, expected: "STUDY_COLLECTION_REVISION_INVALID",
    storeCalls: 0, resourceCalls: 0,
  });
}
console.log(`PASS B57 real domain branch logic: ${assertions} assertions`);
