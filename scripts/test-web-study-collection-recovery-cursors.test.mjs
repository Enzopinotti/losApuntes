import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { collectionRecoveryCursorRepeats } from "../apps/web/src/features/study-collections/collection-recovery-list-pagination.ts";

test("stops a repeated cursor returned by the requested collection page", () => {
  assert.equal(
    collectionRecoveryCursorRepeats(new Set(), "cursor-a", "cursor-a"),
    true,
  );
});

test("stops a cycle to an earlier successfully consumed page", () => {
  assert.equal(
    collectionRecoveryCursorRepeats(
      new Set(["cursor-a", "cursor-b"]),
      "cursor-c",
      "cursor-a",
    ),
    true,
  );
});

test("allows forward progress and a terminal page", () => {
  const used = new Set(["cursor-a"]);
  assert.equal(
    collectionRecoveryCursorRepeats(used, "cursor-b", "cursor-c"),
    false,
  );
  assert.equal(collectionRecoveryCursorRepeats(used, "cursor-b", null), false);
});

test("the recovery selector preserves page retries and offers a fresh list", () => {
  const page = readFileSync(
    new URL(
      "../apps/web/src/pages/StudyCollectionsRecovery.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(page, /listCursorHistoryRef/u);
  assert.match(page, /collectionRecoveryCursorRepeats\(/u);
  assert.match(page, /Actualizar lista de Colecciones/u);
  assert.match(
    page,
    /cursor && previous\?\.scope === ownerScope && !clearSource\s*\? previous\.nextCursor/u,
  );
});
