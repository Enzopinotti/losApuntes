import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planRecallClosure } from "../apps/web/src/features/study/study-recall-closure.mjs";
import {
  normalizeRecallQueue,
  recallSummary,
  nextRecallOutcomes,
} from "../apps/web/src/features/study/study-active-recall.mjs";
import {
  organizeRecallQueue,
} from "../apps/web/src/features/study/study-recall-order.mjs";

const subject = "11111111-1111-4111-8111-111111111111";
const otherSubject = "99999999-9999-4999-8999-999999999999";
const q1 = "a2222222-2222-4222-8222-222222222222";
const q2 = "b3333333-3333-4333-8333-333333333333";
const q3 = "c4444444-4444-4444-8444-444444444444";
const q4 = "d5555555-5555-4555-8555-555555555555";
const ids = normalizeRecallQueue(subject, [q1, q2, q3, q4]);

// An unanswered question is not "wrong"; explicit marks are the only
// evidence this private, non-academic closeout may read.
const untouched = planRecallClosure(subject, ids, {}, 20);
assert.deepEqual(untouched, {
  phase: "classify",
  total: 4,
  pending: 4,
  review: 0,
  understood: 0,
  firstPending: 0,
  firstReview: null,
  estimatedReviewMinutes: 0,
});
const marks = { [q1]: "understood", [q2]: "review", [q4]: "review" };
const baseline = JSON.stringify({ ids, marks });
const mixed = planRecallClosure(subject, ids, marks, 30);
assert.deepEqual(mixed, {
  phase: "classify",
  total: 4,
  pending: 1,
  review: 2,
  understood: 1,
  firstPending: 2,
  firstReview: 1,
  estimatedReviewMinutes: 60,
});
assert.equal(JSON.stringify({ ids, marks }), baseline);
assert.equal(mixed.total, mixed.pending + mixed.review + mixed.understood);
assert.deepEqual(recallSummary(ids, marks), {
  total: 4, completed: 3, pending: 1, review: 2, understood: 1,
});

// Completing explicit classifications moves through review -> ready only
// when the user records those choices, never because they reached the end.
const classified = nextRecallOutcomes(ids, marks, q3, "understood");
assert.deepEqual(planRecallClosure(subject, ids, classified, 45), {
  phase: "review",
  total: 4,
  pending: 0,
  review: 2,
  understood: 2,
  firstPending: null,
  firstReview: 1,
  estimatedReviewMinutes: 90,
});
const explained = Object.fromEntries(ids.map((id) => [id, "understood"]));
assert.deepEqual(planRecallClosure(subject, ids, explained, 15), {
  phase: "ready",
  total: 4,
  pending: 0,
  review: 0,
  understood: 4,
  firstPending: null,
  firstReview: null,
  estimatedReviewMinutes: 0,
});
const single = planRecallClosure(subject, [q3], { [q3]: "review" }, 30);
assert.deepEqual(single, {
  phase: "review",
  total: 1,
  pending: 0,
  review: 1,
  understood: 0,
  firstPending: null,
  firstReview: 0,
  estimatedReviewMinutes: 30,
});

// Reordering only changes the first positions, never the summary or an ID's
// mark. B140 manual priority sorting is compatible with B141 closeout.
const reordered = organizeRecallQueue(subject, ids, 0, marks, "review-first");
assert.ok(reordered);
const afterReorder = planRecallClosure(subject, reordered.ids, marks, 30);
assert.equal(afterReorder.phase, mixed.phase);
assert.equal(afterReorder.review, mixed.review);
assert.equal(afterReorder.estimatedReviewMinutes, mixed.estimatedReviewMinutes);
assert.equal(reordered.ids[afterReorder.firstReview], q2);
assert.equal(reordered.ids[afterReorder.firstPending], q3);
assert.deepEqual(
  planRecallClosure(subject.toUpperCase(), ids.map((x) => x.toUpperCase()), marks, 30),
  mixed,
);

// No grades, question content, titles, user IDs, timestamps, notes or
// persisted state in the output — only bounded indices and integer counts.
const json = JSON.stringify(mixed);
for (const sensitive of [subject, otherSubject, ...ids, "body", "title",
  "answer", "reflections", "userId", "date", "notes", "grade"]) {
  assert.equal(json.includes(sensitive), false, `closure included ${sensitive}`);
}
for (const badArgs of [
  [subject, ids, marks, 0],
  [subject, ids, marks, 10],
  [subject, ids, marks, 21],
  [subject, ids, marks, 120],
  [subject, ids, marks, "30"],
  [subject, ids, marks, NaN],
  [subject, ids, null, 20],
  [subject, ids, [], 20],
  [subject, ids, new Date(), 20],
  [subject, ids, { [otherSubject]: "review" }, 20],
  [subject, ids, { [q1]: "excellent" }, 20],
  [subject, [q1, q1], {}, 20],
  [subject, [], {}, 20],
  ["invalid", ids, {}, 20],
]) {
  assert.throws(() => planRecallClosure(...badArgs));
}
assert.throws(
  () => planRecallClosure(subject, ids, {}, 25),
  /RECALL_CLOSURE_INVALID/u,
);

// The real screen must ask for closure and second-step confirmation; it must
// preserve the round on cancellation and drop it only when the same scope,
// activation, pass and queue remain current. All follow-up actions reuse
// existing, scope-fenced API reads, export and handoff.
const page = readFileSync(
  new URL("../apps/web/src/pages/StudyPractice.tsx", import.meta.url), "utf8",
);
const types = readFileSync(
  new URL("../apps/web/src/features/study/study-recall-closure.d.mts", import.meta.url),
  "utf8",
);
assert.match(types, /export declare function planRecallClosure\(/u);
assert.match(page, /planRecallClosure\(subjectId, round\.ids, round\.outcomes, review\.minutes\)/u);
assert.match(page, /closureState\?\.scope === scope/u);
assert.match(page, /closureState\.activation === activationId/u);
assert.match(page, /const requestCloseRound = \(\) =>/u);
assert.match(page, /const focusClosureQuestion = \(position: number \| null\) =>/u);
assert.match(page, /previous\.ids === round\.ids/u);
assert.match(page, /const finishRound = \(\) =>/u);
assert.match(page, /if \(!window\.confirm\(message\)\) return/u);
assert.match(page, /onClick=\{requestCloseRound\}/u);
assert.match(page, /onClick=\{finishRound\}/u);
assert.match(page, /onClick=\{downloadPrivateSummary\}/u);
assert.match(page, /onClick=\{openPendingInPlanner\}/u);
assert.match(page, /focusClosureQuestion\(closure\.firstPending\)/u);
assert.match(page, /focusClosureQuestion\(closure\.firstReview\)/u);
assert.match(page, /closure\.phase === "classify"/u);
assert.match(page, /closure\.phase === "review"/u);
assert.match(page, /Terminar y descartar notas temporales/u);
assert.match(page, /No se guardará un resultado/u);
assert.match(page, /communityApi\.question\(currentId, ticket\.signal\)/u);
assert.match(page, /response\.question\.academic\.subject\.id !== subjectId/u);
assert.doesNotMatch(page, /localStorage|sessionStorage|IndexedDB/iu);
console.log("B141 Web guided review closeout privacy, steps and guarded finish PASS");
