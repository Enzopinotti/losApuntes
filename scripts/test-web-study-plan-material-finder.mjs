import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STUDY_MATERIAL_SEARCH_DEFAULTS,
  STUDY_MATERIAL_SEARCH_MAX_LENGTH,
  materialTaskMinutes,
  mayAddStudyMaterial,
  normalizeStudyMaterialSearchFilter,
  studyMaterialSearchKey,
} from "../apps/web/src/features/study/study-plan-material-search.mjs";
import { repeatsStudyPlanMaterialCursor } from "../apps/web/src/features/study/study-plan-material-pagination.mjs";

const root = new URL("../", import.meta.url);
const src = (path) => readFileSync(new URL(path, root), "utf8");
const resource = { kind: "resource", q: "  Límites  ", status: "" };
const question = { kind: "question", q: "  ecuaciones  ", status: "closed" };
assert.equal(STUDY_MATERIAL_SEARCH_MAX_LENGTH, 120);
assert.deepEqual(STUDY_MATERIAL_SEARCH_DEFAULTS, {
  kind: "resource",
  q: "",
  status: "",
});
assert.deepEqual(normalizeStudyMaterialSearchFilter(resource), {
  kind: "resource",
  q: "Límites",
  status: "",
});
assert.deepEqual(normalizeStudyMaterialSearchFilter(question), {
  kind: "question",
  q: "ecuaciones",
  status: "closed",
});
assert.deepEqual(
  normalizeStudyMaterialSearchFilter({
    kind: "question",
    q: "x".repeat(120),
    status: "open",
  }),
  { kind: "question", q: "x".repeat(120), status: "open" },
);
for (const invalid of [
  null,
  {},
  { kind: "resource", q: "", status: "" },
  { kind: "resource", q: "x", status: "" },
  { kind: "resource", q: " ".repeat(4) + "x", status: "" },
  { kind: "question", q: "x".repeat(121), status: "" },
  { kind: "resource", q: "algebra", status: "closed" },
  { kind: "question", q: "algebra", status: "solved" },
  { kind: "all", q: "algebra", status: "" },
  { kind: "resource", q: `aa${String.fromCharCode(10)}bb`, status: "" },
  { kind: "question", q: `aa${String.fromCharCode(0)}bb`, status: "" },
  { kind: "question", q: null, status: "" },
]) {
  assert.equal(
    normalizeStudyMaterialSearchFilter(invalid),
    null,
    "An invalid query cannot silently become an unfiltered server request",
  );
}
const scopeA = "authenticated:user1:session1:subject1";
const scopeB = "authenticated:user1:session2:subject1";
const validResource = normalizeStudyMaterialSearchFilter(resource);
const validQuestion = normalizeStudyMaterialSearchFilter(question);
assert.ok(validResource);
assert.ok(validQuestion);
assert.notEqual(
  studyMaterialSearchKey(scopeA, validResource),
  studyMaterialSearchKey(scopeB, validResource),
);
assert.notEqual(
  studyMaterialSearchKey(scopeA, validResource),
  studyMaterialSearchKey(scopeA, validQuestion),
);
assert.notEqual(
  studyMaterialSearchKey(scopeA, validQuestion),
  studyMaterialSearchKey(scopeA, {
    ...validQuestion,
    status: "open",
  }),
);
assert.equal(studyMaterialSearchKey("", validQuestion), null);
assert.equal(
  studyMaterialSearchKey(scopeA, { ...validResource, q: "x" }),
  null,
);

assert.equal(materialTaskMinutes("resource"), 25);
assert.equal(materialTaskMinutes("question"), 20);
assert.equal(materialTaskMinutes("other"), null);
const keys = new Set(["resource:already-added"]);
const canAdd = (kind, id, count, remaining, max = 24) =>
  mayAddStudyMaterial(kind, id, keys, count, remaining, max);
assert.equal(canAdd("resource", "new", 23, 25), true);
assert.equal(canAdd("resource", "new", 23, 24), false);
assert.equal(canAdd("question", "new", 23, 20), true);
assert.equal(canAdd("question", "new", 23, 19), false);
assert.equal(canAdd("resource", "new", 24, 1200), false);
assert.equal(canAdd("resource", "already-added", 1, 1200), false);
assert.equal(canAdd("resource", "", 1, 1200), false);
assert.equal(canAdd("anything", "new", 1, 1200), false);
assert.equal(canAdd("resource", "new", -1, 1200), false);

const finder = src("apps/web/src/features/study/StudyPlanMaterialFinder.tsx");
assert.match(finder, /cursorHistoryRef/u);
assert.match(finder, /repeatedCursorMessage/u);
assert.match(finder, /repeatsStudyPlanMaterialCursor/u);
const page = src("apps/web/src/pages/StudySession.tsx");
const styles = src("apps/web/src/pages/StudySession.scss");
assert.match(finder, /resourcesApi\.search\(/u);
assert.match(finder, /communityApi\.questions\(/u);
assert.match(finder, /q: applied\.q/u);
assert.match(finder, /subjectId,/u);
assert.match(finder, /status:/u);
assert.match(finder, /ticket\.signal/u);
assert.match(finder, /useAsyncAuthorityFence/u);
assert.match(finder, /isSearchCurrent\(ticket\)/u);
assert.match(finder, /isAddCurrent\(ticket\)/u);
assert.match(
  finder,
  /resource\.academic\.subject\.id|item\.academic\.subject\.id === subjectId/u,
);
assert.match(finder, /verified\.academic\.subject\.id !== subjectId/u);
assert.match(finder, /resourcesApi\.get\(item\.id, ticket\.signal\)/u);
assert.match(finder, /communityApi\.question\(item\.id, ticket\.signal\)/u);
assert.match(finder, /mayAddStudyMaterial\(/u);
assert.match(finder, /normalizeStudyMaterialSearchFilter\(draft\)/u);
assert.match(finder, /setApplied\(null\)/u);
assert.match(finder, /pendingAdd\.current/u);
assert.match(finder, /page\?\.nextCursor/u);
assert.match(finder, /Reintentar/u);
assert.match(finder, /Sumar al plan/u);
assert.doesNotMatch(finder, /localStorage|sessionStorage|indexedDB/u);
const requestedMaterialCursors = new Set(["cursor-a"]);
assert.equal(
  repeatsStudyPlanMaterialCursor(
    requestedMaterialCursors,
    "cursor-a",
    "cursor-a",
  ),
  true,
);
assert.equal(
  repeatsStudyPlanMaterialCursor(
    requestedMaterialCursors,
    "cursor-b",
    "cursor-a",
  ),
  true,
);
assert.equal(
  repeatsStudyPlanMaterialCursor(
    requestedMaterialCursors,
    "cursor-b",
    "cursor-c",
  ),
  false,
);
assert.equal(
  repeatsStudyPlanMaterialCursor(requestedMaterialCursors, "cursor-a", null),
  false,
);
assert.match(page, /<StudyPlanMaterialFinder/u);
assert.match(page, /key=\{scope\}/u);
assert.match(page, /subjectId=\{subject\.id\}/u);
assert.match(page, /authorityScope=\{scope\}/u);
assert.match(page, /existingKeys=\{known\}/u);
assert.match(page, /onAdd=\{appendTask\}/u);
assert.match(page, /STUDY_SESSION_MAX_MINUTES - totalMinutes/u);
assert.match(
  page,
  /draft\.plan\.tasks\.reduce\([\s\S]{0,120}task\.minutes,[\s\S]{0,100}> STUDY_SESSION_MAX_MINUTES/u,
);
assert.match(styles, /\.study-session-material-form/u);
assert.match(styles, /\.study-session-material-finder button/u);
assert.doesNotMatch(page, /window\.localStorage/u);
console.log("B180 study planner search, membership and budget contract: PASS");
