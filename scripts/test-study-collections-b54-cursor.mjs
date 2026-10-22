import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Execute the cursor handlers extracted from the real domain service with
// only TypeScript annotations stripped. This checks their decisions without
// depending on Nest, Mongo or a full workspace install.
const service = readFileSync(
  new URL("../apps/api/src/study-collections/domain/study-collection.service.ts", import.meta.url),
  "utf8",
);

function between(start, end) {
  const a = service.indexOf(start);
  const b = service.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `Missing domain cursor function: ${start}`);
  return service.slice(a, b);
}
const parseSrc = between("function parseCursor(", "\nfunction listCursor(")
  .replace(
    "function parseCursor(value?: string): Record<string, unknown> | null {",
    "function parseCursor(value) {",
  )
  .replace("const decoded: unknown =", "const decoded =")
  .replace("return decoded as Record<string, unknown>;", "return decoded;");
const itemsSrc = between("function itemsCursor(", "\nfunction projection(")
  .replace(
    /function itemsCursor\([\s\S]*?\): number \{/u,
    "function itemsCursor(value, ownerUserId, collection) {",
  )
  .replace(/\(parsed\.(index|revision) as number\)/gu, "parsed.$1")
  .replace("return parsed.index as number;", "return parsed.index;");

class CursorConflict extends Error {
  constructor(payload) {
    super(payload.message);
    this.response = payload;
  }
}
function invalidCursor() {
  const err = new Error("Invalid collection cursor");
  err.response = { code: "STUDY_COLLECTION_CURSOR_INVALID" };
  throw err;
}
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const { parseCursor, itemsCursor } = new Function(
  "Buffer",
  "UUID_V4",
  "ConflictException",
  "invalidCursor",
  `${parseSrc}\n${itemsSrc}\nreturn { parseCursor, itemsCursor };`,
)(Buffer, UUID_V4, CursorConflict, invalidCursor);

const owner = "account-1";
const collectionId = "11111111-1111-4111-8111-111111111111";
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const valid = { version: 1, ownerUserId: owner, collectionId, revision: 2, index: 1 };
let cases = 0;
const expectValue = (cursor, revision, resourceIds, expected) => {
  cases += 1;
  assert.equal(itemsCursor(
    cursor, owner, { id: collectionId, revision, resourceIds },
  ), expected);
};
const expectCode = (cursor, revision, resourceIds, code) => {
  cases += 1;
  assert.throws(
    () => itemsCursor(cursor, owner, { id: collectionId, revision, resourceIds }),
    (error) => error.response?.code === code,
  );
};
expectValue(undefined, 2, ["one", "two"], 0);
expectValue(encode(valid), 2, ["one", "two"], 1);
expectCode(encode(valid), 3, ["one"], "STUDY_COLLECTION_CURSOR_STALE");
expectCode(encode(valid), 4, [], "STUDY_COLLECTION_CURSOR_STALE");
expectCode(encode(valid), 2, ["one"], "STUDY_COLLECTION_CURSOR_INVALID");
for (const bad of [
  { ...valid, ownerUserId: "intruder" },
  { ...valid, collectionId: "22222222-2222-4222-8222-222222222222" },
  { ...valid, revision: "2" },
  { ...valid, revision: 2.5 },
  { ...valid, index: -1 },
  { ...valid, index: 0.25 },
  { ...valid, version: 2 },
  { ...valid, admin: true },
]) {
  expectCode(encode(bad), 2, ["one", "two"], "STUDY_COLLECTION_CURSOR_INVALID");
}
expectCode("", 2, ["one", "two"], "STUDY_COLLECTION_CURSOR_INVALID");
expectCode("not-valid!", 2, ["one", "two"], "STUDY_COLLECTION_CURSOR_INVALID");
cases += 1;
assert.throws(() => parseCursor(""), (error) =>
  error.response?.code === "STUDY_COLLECTION_CURSOR_INVALID",
);

console.log(`B54 live domain cursor decisions: ${cases} cases PASS`);
