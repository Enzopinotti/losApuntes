import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { studySessionCursorRepeats } from "../apps/web/src/features/study/study-session-source-pagination.ts";

test("detects repeated current and earlier study-session cursors", () => {
  assert.equal(
    studySessionCursorRepeats(new Set(), "cursor-a", "cursor-a"),
    true,
  );
  assert.equal(
    studySessionCursorRepeats(
      new Set(["cursor-a", "cursor-b"]),
      "cursor-c",
      "cursor-a",
    ),
    true,
  );
});

test("allows a new study-session cursor and a completed page chain", () => {
  const used = new Set(["cursor-a"]);
  assert.equal(studySessionCursorRepeats(used, "cursor-a", "cursor-b"), false);
  assert.equal(studySessionCursorRepeats(used, "cursor-a", null), false);
});

test("saved, found, and question sources recover independently", async () => {
  const page = await readFile("apps/web/src/pages/StudySession.tsx", "utf8");
  assert.match(page, /savedCursors\s*=\s*useRef/u);
  assert.match(page, /foundCursors\s*=\s*useRef/u);
  assert.match(page, /questionCursors\s*=\s*useRef/u);
  assert.equal((page.match(/studySessionCursorRepeats\(/gu) ?? []).length, 3);
  assert.match(page, /Los apuntes guardados repitieron una página/u);
  assert.match(page, /Los apuntes disponibles repitieron una página/u);
  assert.match(page, /Las preguntas de la materia repitieron una página/u);
  assert.match(page, /Actualizar guardados/u);
  assert.match(page, /Actualizar disponibles/u);
  assert.match(page, /Actualizar preguntas/u);
  assert.match(page, /cursor: old\?\.scope === scope \? old\.cursor : null/u);
  assert.match(page, /cursorCycle: true/u);
});
