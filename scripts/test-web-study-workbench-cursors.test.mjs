import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { studyWorkbenchCursorRepeats } from "../apps/web/src/features/study/study-workbench-pagination.ts";

test("detects a cursor that immediately repeats the requested page", () => {
  assert.equal(
    studyWorkbenchCursorRepeats(new Set(), "cursor-a", "cursor-a"),
    true,
  );
});

test("detects a cycle to any successfully consumed page", () => {
  assert.equal(
    studyWorkbenchCursorRepeats(
      new Set(["cursor-a", "cursor-b"]),
      "cursor-c",
      "cursor-a",
    ),
    true,
  );
});

test("allows a new cursor and the end of pagination", () => {
  const used = new Set(["cursor-a"]);
  assert.equal(
    studyWorkbenchCursorRepeats(used, "cursor-b", "cursor-c"),
    false,
  );
  assert.equal(studyWorkbenchCursorRepeats(used, "cursor-b", null), false);
});

test("keeps saved and available source cursor histories independent", () => {
  const workbench = readFileSync(
    new URL("../apps/web/src/pages/StudyWorkbench.tsx", import.meta.url),
    "utf8",
  );
  assert.match(workbench, /savedCursorHistoryRef/u);
  assert.match(workbench, /availableCursorHistoryRef/u);
  assert.equal(workbench.match(/studyWorkbenchCursorRepeats\(/gu)?.length, 2);
  assert.match(workbench, /loadSaved\(saved\.cursor \?\? undefined, true\)/u);
  assert.match(
    workbench,
    /loadAvailable\(available\.cursor \?\? undefined, true\)/u,
  );
});
