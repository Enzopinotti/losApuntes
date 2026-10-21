import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_STUDY_QUESTION_FILTER,
  normalizeStudyQuestionFilter,
  studyQuestionFilterKey,
  STUDY_QUESTION_QUERY_MAX_LENGTH,
} from "../apps/web/src/features/study/study-question-explorer.mjs";

import {
  resolveStudySubject,
  studySubjectHref,
  studySubjectSelectionFromParams,
} from "../apps/web/src/features/study/study-subject-navigation.mjs";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const buckets = [
  { subject: { id: a, name: "Álgebra" }, resources: [] },
  { subject: { id: b, name: "Química" }, resources: [] },
];
assert.deepEqual(studySubjectSelectionFromParams(new URLSearchParams()), {
  kind: "unselected",
});
assert.equal(
  resolveStudySubject({ kind: "unselected" }, buckets).subject.id,
  a,
);
assert.equal(
  resolveStudySubject({ kind: "selected", subjectId: b }, buckets).subject.name,
  "Química",
);
assert.deepEqual(
  studySubjectSelectionFromParams(new URLSearchParams("subjectId=not-an-id")),
  { kind: "invalid" },
);
assert.deepEqual(
  studySubjectSelectionFromParams(
    new URLSearchParams(`subjectId=${a}&subjectId=${b}`),
  ),
  { kind: "invalid" },
);
assert.deepEqual(
  studySubjectSelectionFromParams(
    new URLSearchParams("subjectId=11111111-1111-1111-8111-111111111111"),
  ),
  { kind: "invalid" },
);
assert.deepEqual(
  resolveStudySubject({ kind: "invalid" }, buckets),
  { kind: "invalid" },
);
assert.deepEqual(
  resolveStudySubject({ kind: "unselected" }, []),
  { kind: "no-context" },
);
assert.deepEqual(
  resolveStudySubject({ kind: "selected", subjectId: b }, []),
  { kind: "no-context" },
);
assert.deepEqual(
  resolveStudySubject(
    { kind: "selected", subjectId: "33333333-3333-4333-8333-333333333333" },
    buckets,
  ),
  { kind: "unavailable" },
);
assert.equal(studySubjectHref("oops"), null);
assert.equal(studySubjectHref(a), `/study?subjectId=${a}`);
assert.equal(
  studySubjectSelectionFromParams(
    new URLSearchParams(`subjectId=${b.toUpperCase()}`),
  ).subjectId,
  b,
);
assert.deepEqual(
  resolveStudySubject(
    { kind: "unselected" },
    [{ subject: { id: "invalid", name: "Unsafe" } }],
  ),
  { kind: "unavailable" },
);
const base = {
  ...DEFAULT_STUDY_QUESTION_FILTER,
};
assert.deepEqual(
  normalizeStudyQuestionFilter(base),
  { q: "", status: "open" },
);
assert.deepEqual(
  normalizeStudyQuestionFilter({ q: "  matrices  ", status: "closed" }),
  { q: "matrices", status: "closed" },
);
assert.deepEqual(
  normalizeStudyQuestionFilter({ q: "  recursión  ", status: "" }),
  { q: "recursión", status: "" },
);
assert.equal(STUDY_QUESTION_QUERY_MAX_LENGTH, 120);
for (const invalid of [
  null,
  {},
  { q: "a", status: "open" },
  { q: " ".repeat(3) + "a", status: "closed" },
  { q: "x".repeat(121), status: "" },
  { q: `al${String.fromCharCode(10)}nn`, status: "open" },
  { q: "álgebra", status: "hidden" },
  { q: "álgebra", status: undefined },
  { q: null, status: "open" },
]) {
  assert.equal(
    normalizeStudyQuestionFilter(invalid),
    null,
    "Invalid keyword or visibility filters must fail closed",
  );
}
const viewerOne = "authenticated:user-a:session-a";
const viewerTwo = "authenticated:user-a:session-b";
const scopeOne = JSON.stringify([viewerOne, a]);
const scopeTwo = JSON.stringify([viewerTwo, a]);
const questionKey = studyQuestionFilterKey(scopeOne, base);
assert.equal(typeof questionKey, "string");
assert.notEqual(questionKey, studyQuestionFilterKey(scopeTwo, base));
assert.notEqual(
  questionKey,
  studyQuestionFilterKey(JSON.stringify([viewerOne, b]), base),
);
assert.notEqual(
  questionKey,
  studyQuestionFilterKey(scopeOne, { q: "matrices", status: "open" }),
);
assert.notEqual(
  questionKey,
  studyQuestionFilterKey(scopeOne, { q: "", status: "closed" }),
);
assert.equal(studyQuestionFilterKey(scopeOne, { q: "x", status: "open" }), null);
const source = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
const explorer = source(
  "apps/web/src/features/study/StudySubjectQuestions.tsx",
);
const workbench = source("apps/web/src/pages/StudyWorkbench.tsx");
const styles = source("apps/web/src/pages/StudyWorkbench.scss");
assert.match(explorer, /communityApi\.questions\(/u);
assert.match(explorer, /subjectId,/u);
assert.match(explorer, /status: applied\.status \|\| undefined/u);
assert.match(explorer, /q: applied\.q \|\| undefined/u);
assert.match(explorer, /normalizeStudyQuestionFilter\(draft\)/u);
assert.match(explorer, /useAsyncAuthorityFence/u);
assert.match(explorer, /isQuestionsCurrent\(ticket\)/u);
assert.match(explorer, /ticket\.signal/u);
assert.match(explorer, /currentPage\?\.nextCursor/u);
assert.match(explorer, /practiceQuestionHref\(subjectId, item\.id\)/u);
assert.match(explorer, /item\.state === "open"/u);
assert.match(explorer, /No hay preguntas visibles con estos filtros/u);
assert.match(explorer, /estado/u);
assert.doesNotMatch(explorer, /localStorage|sessionStorage|indexedDB/u);
assert.match(workbench, /<StudySubjectQuestions/u);
assert.ok(
  workbench.includes('key={`${authScope}:${selectedSubject.id}`}'),
  "The explorer must remount on viewer and subject changes",
);
assert.doesNotMatch(
  workbench,
  /communityApi\.questions\(/u,
  "The Workbench must not duplicate the explorer's Q&A fetch",
);
assert.match(styles, /study-workbench-question-filters input:focus-visible/u);
assert.match(styles, /study-workbench-question-actions button/u);

console.log("Study Workbench Q&A explorer contract: PASS (filters, scoping and navigation)");
