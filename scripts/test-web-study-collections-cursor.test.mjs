import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  appendUniqueBy,
  collectionCursorRepeats,
} from "../apps/web/src/features/study-collections/collectionPagination.ts";

test("detects repeated current and previously used collection cursors", () => {
  assert.equal(
    collectionCursorRepeats(new Set(), "cursor-a", "cursor-a"),
    true,
  );
  assert.equal(
    collectionCursorRepeats(
      new Set(["cursor-a", "cursor-b"]),
      "cursor-c",
      "cursor-a",
    ),
    true,
  );
});

test("allows a new collection cursor and the final page", () => {
  const used = new Set(["cursor-a"]);
  assert.equal(collectionCursorRepeats(used, "cursor-a", "cursor-b"), false);
  assert.equal(collectionCursorRepeats(used, "cursor-a", null), false);
});

test("appends collections and members by their canonical identity", () => {
  assert.deepEqual(
    appendUniqueBy(
      [
        { id: "collection-a", title: "A" },
        { id: "collection-b", title: "B" },
      ],
      [
        { id: "collection-b", title: "B updated" },
        { id: "collection-c", title: "C" },
      ],
      (item) => item.id,
    ),
    [
      { id: "collection-a", title: "A" },
      { id: "collection-b", title: "B updated" },
      { id: "collection-c", title: "C" },
    ],
  );
  assert.deepEqual(
    appendUniqueBy(
      [{ resourceId: "resource-a", title: "A" }],
      [{ resourceId: "resource-a", title: "A updated" }],
      (item) => item.resourceId,
    ),
    [{ resourceId: "resource-a", title: "A updated" }],
  );
});

test("Web keeps separate cursor histories and exposes fresh-page recovery", async () => {
  const page = await readFile(
    "apps/web/src/pages/StudyCollections.tsx",
    "utf8",
  );
  assert.match(page, /loadedCollectionCursors[\s\S]{0,100}scope: authScope/u);
  assert.match(page, /loadedResourceCursors[\s\S]{0,100}scope: detailScope/u);
  assert.match(
    page,
    /collectionCursorRepeats\(previousCursors, cursor, next\.nextCursor\)/u,
  );
  assert.match(
    page,
    /collectionCursorRepeats\(previousCursors, cursor, page\.nextCursor\)/u,
  );
  assert.match(page, /cursorCycle: true/u);
  assert.match(page, /Actualizar colecciones/u);
  assert.match(page, /Actualizar colección/u);
  assert.match(page, /nextCursor: preserve \? previous\.nextCursor : null/u);
  assert.match(page, /STUDY_COLLECTION_CURSOR_STALE/u);
});
