import assert from "node:assert/strict";
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
console.log("Study Workbench navigation contract: PASS (navigation and authority guards)");
