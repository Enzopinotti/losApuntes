import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { studyKitCursorRepeats } from "../apps/web/src/features/study/study-kit-source-pagination.ts";

test("detects a repeated current or earlier Study Kit source cursor", () => {
  assert.equal(studyKitCursorRepeats(new Set(), "cursor-a", "cursor-a"), true);
  assert.equal(
    studyKitCursorRepeats(
      new Set(["cursor-a", "cursor-b"]),
      "cursor-c",
      "cursor-a",
    ),
    true,
  );
});

test("allows a new Study Kit source cursor and a completed page chain", () => {
  const used = new Set(["cursor-a"]);
  assert.equal(studyKitCursorRepeats(used, "cursor-a", "cursor-b"), false);
  assert.equal(studyKitCursorRepeats(used, "cursor-a", null), false);
});

test("saved and found sources have independent recovery paths", async () => {
  const kits = await readFile("apps/web/src/pages/StudyKits.tsx", "utf8");
  assert.match(kits, /savedCursors\s*=\s*useRef/u);
  assert.match(kits, /foundCursors\s*=\s*useRef/u);
  assert.equal(
    (
      kits.match(
        /studyKitCursorRepeats\([\s\S]{0,140}response\.nextCursor\)/gu,
      ) ?? []
    ).length,
    2,
  );
  assert.match(kits, /Los apuntes guardados repitieron una página/u);
  assert.match(kits, /Los apuntes encontrados repitieron una página/u);
  assert.match(kits, /Actualizar guardados/u);
  assert.match(kits, /Actualizar encontrados/u);
  assert.match(kits, /addDistinct\(previous\.data\.items, response\.items\)/u);
  assert.match(kits, /cursorCycle: true/u);
  assert.match(kits, /nextCursor: null/u);
});
