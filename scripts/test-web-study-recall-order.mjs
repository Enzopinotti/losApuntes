import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  organizeRecallQueue,
  RECALL_ORDER_ACTIONS,
} from "../apps/web/src/features/study/study-recall-order.mjs";
import {
  normalizeRecallQueue,
  recallSummary,
  recallToStudySession,
  retryRecallQueue,
} from "../apps/web/src/features/study/study-active-recall.mjs";
import { nextRecallFocus } from "../apps/web/src/features/study/study-recall-focus.mjs";
import {
  pauseRecallRound,
  takeRecallPause,
} from "../apps/web/src/features/study/study-recall-pause.mjs";

const subject = "11111111-1111-4111-8111-111111111111";
const q1 = "a2222222-2222-4222-8222-222222222222";
const q2 = "b3333333-3333-4333-8333-333333333333";
const q3 = "c4444444-4444-4444-8444-444444444444";
const q4 = "d5555555-5555-4555-8555-555555555555";
const q5 = "e6666666-6666-4666-8666-666666666666";
const ids = normalizeRecallQueue(subject, [q1, q2, q3, q4, q5]);
const outcomes = { [q1]: "understood", [q2]: "review", [q4]: "review" };
const serialized = JSON.stringify({ ids, outcomes });
assert.deepEqual(RECALL_ORDER_ACTIONS, [
  "earlier", "later", "review-first", "pending-first",
]);

// Priorities come only from explicit user marks; no inferred quiz scores.
// Sorting preserves relative order in each bucket and selected question ID.
const reviewFirst = organizeRecallQueue(subject, ids, 2, outcomes, "review-first");
assert.deepEqual(reviewFirst, {
  ids: [q2, q4, q3, q5, q1],
  position: 2,
});
const pendingFirst = organizeRecallQueue(subject, ids, 3, outcomes, "pending-first");
assert.deepEqual(pendingFirst, {
  ids: [q3, q5, q2, q4, q1],
  position: 3,
});
assert.equal(reviewFirst.ids[reviewFirst.position], q3);
assert.equal(pendingFirst.ids[pendingFirst.position], q4);
assert.equal(JSON.stringify({ ids, outcomes }), serialized);
assert.equal(
  organizeRecallQueue(subject, reviewFirst.ids, reviewFirst.position, outcomes, "review-first"),
  null,
);
assert.equal(
  organizeRecallQueue(subject, pendingFirst.ids, pendingFirst.position, outcomes, "pending-first"),
  null,
);

// Up/down moves only the selected ID by exactly one slot; no additions, loss,
// or marks changes. Boundary or single-question moves are harmless no-ops.
assert.deepEqual(
  organizeRecallQueue(subject, ids, 2, outcomes, "earlier"),
  { ids: [q1, q3, q2, q4, q5], position: 1 },
);
assert.deepEqual(
  organizeRecallQueue(subject, ids, 2, outcomes, "later"),
  { ids: [q1, q2, q4, q3, q5], position: 3 },
);
assert.equal(organizeRecallQueue(subject, ids, 0, outcomes, "earlier"), null);
assert.equal(organizeRecallQueue(subject, ids, 4, outcomes, "later"), null);
assert.equal(organizeRecallQueue(subject, [q1], 0, {}, "earlier"), null);
assert.equal(organizeRecallQueue(subject, [q1], 0, {}, "review-first"), null);
assert.equal(organizeRecallQueue(subject, [q1], 0, {}, "pending-first"), null);

// Sorting is equally deterministic without marks, and handles all reviewed.
assert.deepEqual(
  organizeRecallQueue(subject, ids, 0, {}, "review-first"),
  null,
);
assert.deepEqual(
  organizeRecallQueue(subject, ids, 0, {}, "pending-first"),
  null,
);
assert.deepEqual(
  organizeRecallQueue(subject, ids, 0, Object.fromEntries(ids.map(id => [id, "understood"])), "review-first"),
  null,
);

// Exported review-only plan reflects the user's new priority order without
// disclosing question titles, reflections, or introducing new permissions.
const baseline = recallSummary(ids, outcomes);
const updated = recallSummary(reviewFirst.ids, outcomes);
assert.deepEqual(updated, baseline);
assert.deepEqual(retryRecallQueue(subject, reviewFirst.ids, outcomes), [q2, q4]);
const plan = recallToStudySession(subject, reviewFirst.ids, outcomes);
assert.ok(plan);
assert.deepEqual(plan.tasks.map((t) => t.id), [q2, q4]);
assert.equal(nextRecallFocus(subject, reviewFirst.ids, 2, outcomes, "review"), 0);
assert.deepEqual(
  organizeRecallQueue(subject.toUpperCase(), ids.map((x) => x.toUpperCase()), 2, outcomes, "review-first"),
  reviewFirst,
);

// A reordered paused round resumes on the same selected question. Its
// pause snapshot carries only IDs/marks, never written attempts or answers.
const scope = `authenticated:user1:session1:${subject}:none`;
assert.equal(pauseRecallRound(scope, subject, {
  ids: reviewFirst.ids,
  position: reviewFirst.position,
  pass: 1,
  outcomes,
  history: [],
  startsAt: "",
  minutes: 20,
}, 100000), true);
const restored = takeRecallPause(scope, subject, 100001);
assert.ok(restored);
assert.equal(restored.ids[restored.position], q3);
assert.deepEqual(restored.outcomes, outcomes);
assert.equal(JSON.stringify(restored).includes("reflections"), false);
assert.equal(JSON.stringify(restored).includes("revealedIds"), false);

// Reject malformed positions, IDs, foreign marks, invalid actions and objects.
for (const args of [
  [subject, ids, -1, {}, "later"],
  [subject, ids, 5, {}, "later"],
  [subject, ids, 1.5, {}, "later"],
  [subject, ids, NaN, {}, "review-first"],
  [subject, ids, 0, {}, "unknown"],
  [subject, ids, 0, {}, null],
  [subject, ids, 0, { [q1]: "excellent" }, "review-first"],
  [subject, ids, 0, { ["99999999-9999-4999-8999-999999999999"]: "review" }, "review-first"],
  [subject, ids, 0, new Date(), "review-first"],
]) {
  assert.throws(() => organizeRecallQueue(...args));
}
assert.throws(
  () => organizeRecallQueue(subject, [q1, q1], 0, {}, "later"),
  /ACTIVE_RECALL_DUPLICATE/u,
);
assert.throws(
  () => organizeRecallQueue("invalid", ids, 0, {}, "later"),
  /ACTIVE_RECALL_QUEUE_INVALID/u,
);

// Actual UI keeps the same question ID after a reorder, fences out
// outdated state updates, keeps the existing authorization and never stores
// marks or content in localStorage, sessionStorage, or IndexedDB.
const page = readFileSync(
  new URL("../apps/web/src/pages/StudyPractice.tsx", import.meta.url), "utf8",
);
const types = readFileSync(
  new URL("../apps/web/src/features/study/study-recall-order.d.mts", import.meta.url), "utf8",
);
assert.match(types, /export declare function organizeRecallQueue\(/u);
assert.match(page, /const reorderRound = \(action: RecallOrderAction\)/u);
assert.match(page, /organizeRecallQueue\(\s*subjectId,\s*round\.ids,\s*round\.position,\s*round\.outcomes,\s*action,?\s*\)/u);
assert.match(page, /previous\.ids\.every\(\(id, index\) => id === round\.ids\[index\]\)/u);
assert.match(page, /previous\.ids\[previous\.position\] === round\.ids\[round\.position\]/u);
assert.match(page, /\{ \.\.\.previous, ids: result\.ids, position: result\.position \}/u);
assert.match(page, /disabled=\{reviewFirstOrder === null\}/u);
assert.match(page, /disabled=\{pendingFirstOrder === null\}/u);
assert.match(page, /onClick=\{\(\) => reorderRound\("earlier"\)\}/u);
assert.match(page, /onClick=\{\(\) => reorderRound\("later"\)\}/u);
assert.match(page, /onClick=\{\(\) => reorderRound\("review-first"\)\}/u);
assert.match(page, /onClick=\{\(\) => reorderRound\("pending-first"\)\}/u);
assert.match(page, /communityApi\.question\(currentId, ticket\.signal\)/u);
assert.match(page, /response\.question\.academic\.subject\.id !== subjectId/u);
assert.match(page, /pass: round\.pass/u);
assert.doesNotMatch(page, /localStorage|sessionStorage|IndexedDB/iu);
console.log("B140 explicit-priority and manual ordering of active recall PASS");
