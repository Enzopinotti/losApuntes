import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ACTIVE_RECALL_PLAN_FILE_LIMIT,
  importRecallReviewPlan,
} from "../apps/web/src/features/study/study-recall-plan-import.mjs";
import {
  emptyStudySession,
  serializeStudySession,
  readStudySession,
} from "../apps/web/src/features/study/study-session-plan.mjs";
import {
  recallToStudySession,
} from "../apps/web/src/features/study/study-active-recall.mjs";
import {
  organizeRecallSession,
} from "../apps/web/src/features/study/study-recall-planning.mjs";

const subject = "11111111-1111-4111-8111-111111111111";
const another = "22222222-2222-4222-8222-222222222222";
const q1 = "a2222222-2222-4222-8222-222222222222";
const q2 = "b3333333-3333-4333-8333-333333333333";
const q3 = "c4444444-4444-4444-8444-444444444444";
const base = recallToStudySession(subject, [q1, q2, q3], {
  [q1]: "review", [q2]: "understood", [q3]: "review",
});
assert.ok(base);
assert.equal(ACTIVE_RECALL_PLAN_FILE_LIMIT, 64000);
const timed = organizeRecallSession(base, "2026-10-21T20:15", 30,
  new Date(2026, 9, 19).getTime());
const input = serializeStudySession(timed);
const imported = importRecallReviewPlan(subject, input);
assert.deepEqual(imported, {
  ids: [q1, q3],
  startsAt: "2026-10-21T20:15",
  minutes: 30,
});
assert.equal(imported.ids.length, 2);
assert.equal(JSON.stringify(imported).includes("title"), false);
assert.equal(JSON.stringify(imported).includes("notes"), false);
assert.equal(JSON.stringify(imported).includes(q2), false);
assert.equal(JSON.stringify(timed), JSON.stringify(readStudySession(input)));
const unscheduled = importRecallReviewPlan(subject, serializeStudySession(base));
assert.deepEqual(unscheduled, { ids: [q1, q3], startsAt: "", minutes: 20 });
for (const minutes of [15, 20, 30, 45]) {
  const candidate = organizeRecallSession(base, null, minutes);
  assert.equal(importRecallReviewPlan(subject, serializeStudySession(candidate)).minutes,
    minutes);
}
assert.deepEqual(
  importRecallReviewPlan(subject.toUpperCase(), input).ids,
  [q1, q3],
);

// Only an explicit single-matter question-only unfinished v1 plan may start
// a round. A plan from another subject must never grant authority.
const invalid = [
  [another, input],
  ["not-a-uuid", input],
  [subject, ""],
  [subject, "not-json"],
  [subject, input.repeat(150)],
  [subject, serializeStudySession(emptyStudySession(subject))],
  [subject, serializeStudySession({
    ...timed, tasks: [{ ...timed.tasks[0], kind: "resource" }],
  })],
  [subject, serializeStudySession({
    ...timed, tasks: [{ ...timed.tasks[0], done: true }],
  })],
  [subject, serializeStudySession({
    ...timed,
    tasks: timed.tasks.map((t, i) => ({ ...t, minutes: i === 0 ? 15 : 30 })),
  })],
  [subject, serializeStudySession({
    ...timed, tasks: timed.tasks.map((t) => ({ ...t, minutes: 25 })),
  })],
  [subject, JSON.stringify({ ...timed, version: 99 })],
  [subject, JSON.stringify({ ...timed, subjectId: another })],
  [subject, JSON.stringify({ ...timed, tasks: [
    timed.tasks[0], timed.tasks[0],
  ] })],
];
for (const [target, text] of invalid) {
  assert.throws(() => importRecallReviewPlan(target, text));
}
assert.throws(
  () => importRecallReviewPlan(another, input),
  /RECALL_PLAN_SUBJECT_MISMATCH/u,
);
assert.throws(
  () => importRecallReviewPlan(subject, serializeStudySession({
    ...timed, tasks: [{ ...timed.tasks[0], done: true }],
  })),
  /RECALL_PLAN_QUESTION_ONLY/u,
);
assert.throws(
  () => importRecallReviewPlan(subject, serializeStudySession({
    ...timed, tasks: timed.tasks.map((t) => ({ ...t, minutes: 25 })),
  })),
  /RECALL_PLAN_DURATION_INVALID/u,
);

// File-authored text is not returned. Import only opaque identifiers and
// user-owned schedule metadata; question labels must come from live API.
const authored = serializeStudySession({
  ...timed,
  title: "INJECTED_TITLE",
  notes: "INJECTED_NOTES",
});
const opaque = JSON.stringify(importRecallReviewPlan(subject, authored));
assert.doesNotMatch(opaque, /INJECTED_TITLE|INJECTED_NOTES/u);

// Screen security contract: file-size bound before reading, all-or-nothing
// server authorization, exact auth/subject fence, new round with answers
// hidden, and only after checks have completed.
const page = readFileSync(
  new URL("../apps/web/src/pages/StudyPractice.tsx", import.meta.url),
  "utf8",
);
const types = readFileSync(
  new URL("../apps/web/src/features/study/study-recall-plan-import.d.mts", import.meta.url),
  "utf8",
);
assert.match(types, /export declare function importRecallReviewPlan\(/u);
assert.match(page, /useAsyncAuthorityFence\(`practice-import:\$\{scope\}`\)/u);
assert.match(page, /file\.size > ACTIVE_RECALL_PLAN_FILE_LIMIT/u);
assert.match(page, /importRecallReviewPlan\(subjectId, await file\.text\(\)\)/u);
assert.match(page, /for \(const id of imported\.ids\)/u);
assert.match(page, /communityApi\.question\(id, ticket\.signal\)/u);
assert.match(page, /if \(!importCurrent\(ticket\)\) return/u);
assert.match(page, /response\.question\.id !== id/u);
assert.match(page, /response\.question\.academic\.subject\.id !== subjectId/u);
assert.match(page, /startRound\(imported\.ids, true\)/u);
assert.match(page, /setReviewSettings\(\{\s*scope,\s*startsAt: imported\.startsAt/u);
assert.match(page, /revealedIds: \[\],\s*outcomes: \{\},\s*reflections: \{\}/u);
assert.match(page, /finishImport\(ticket\)/u);
assert.match(page, /event\.target\.value = ""/u);
assert.match(page, /disabled=\{importBusy\}/u);
assert.match(page, /aria-label="Importar plan de preguntas pendientes"/u);
assert.match(page, /¿Reemplazar tu ronda pausada por este plan/u);
assert.doesNotMatch(page, /localStorage|sessionStorage|IndexedDB/iu);
console.log("B139 private, all-or-nothing question-plan import PASS");
