import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nextRecallFocus } from "../apps/web/src/features/study/study-recall-focus.mjs";
import {
  normalizeRecallQueue,
  nextRecallOutcomes,
} from "../apps/web/src/features/study/study-active-recall.mjs";

const subject = "11111111-1111-4111-8111-111111111111";
const q1 = "a2222222-2222-4222-8222-222222222222";
const q2 = "b3333333-3333-4333-8333-333333333333";
const q3 = "c4444444-4444-4444-8444-444444444444";
const q4 = "d5555555-5555-4555-8555-555555555555";
const ids = normalizeRecallQueue(subject, [q1, q2, q3, q4]);
const outcomes = {
  [q1]: "review",
  [q2]: "understood",
  [q4]: "review",
};
const original = JSON.stringify(outcomes);

// Search starts after the currently selected question, skips explained, wraps
// at the end, and never returns the current index as a "next" hit.
assert.equal(nextRecallFocus(subject, ids, 0, outcomes, "pending"), 2);
assert.equal(nextRecallFocus(subject, ids, 3, outcomes, "pending"), 2);
assert.equal(nextRecallFocus(subject, ids, 2, outcomes, "pending"), null);
assert.equal(nextRecallFocus(subject, ids, 0, outcomes, "review"), 3);
assert.equal(nextRecallFocus(subject, ids, 3, outcomes, "review"), 0);
assert.equal(nextRecallFocus(subject, ids, 1, outcomes, "review"), 3);
assert.equal(nextRecallFocus(subject, ids, 2, {}, "review"), null);
assert.equal(nextRecallFocus(subject, ids, 2, {}, "pending"), 3);
assert.equal(nextRecallFocus(subject, [q1], 0, {}, "pending"), null);
assert.equal(nextRecallFocus(subject, [q1], 0, { [q1]: "review" }, "review"), null);
assert.equal(JSON.stringify(outcomes), original, "focus cannot modify marks");
assert.deepEqual(ids, [q1, q2, q3, q4], "focus cannot reorder or discard questions");
const after = nextRecallOutcomes(ids, outcomes, q3, "understood");
assert.equal(nextRecallFocus(subject, ids, 0, after, "pending"), null);

// Canonicalization is subject-scoped and strict: no outside IDs, invalid
// states, forged marks, prototype objects, duplicated IDs or invalid offsets.
assert.equal(nextRecallFocus(subject.toUpperCase(), ids.map(x => x.toUpperCase()),
  3, outcomes, "review"), 0);
const invalidCalls = [
  [subject, ids, -1, outcomes, "pending"],
  [subject, ids, 4, outcomes, "review"],
  [subject, ids, 0.5, outcomes, "pending"],
  [subject, ids, Number.NaN, outcomes, "pending"],
  [subject, ids, 0, outcomes, "understood"],
  [subject, ids, 0, outcomes, null],
  [subject, ids, 0, { [q2]: "grade-A" }, "review"],
  [subject, ids, 0, { ["99999999-9999-4999-8999-999999999999"]: "review" }, "review"],
  [subject, ids, 0, new Date(), "pending"],
];
for (const args of invalidCalls) {
  assert.throws(() => nextRecallFocus(...args));
}
assert.throws(() => nextRecallFocus(subject, [q1, q1], 0, {}, "pending"),
  /ACTIVE_RECALL_DUPLICATE/u);
assert.throws(() => nextRecallFocus("invalid", ids, 0, {}, "pending"),
  /ACTIVE_RECALL_QUEUE_INVALID/u);

// Integration checks: button disabled state, current-scope fence, on-demand
// server fetch, and no persistence, mutation of marks or score calculation.
const page = readFileSync(
  new URL("../apps/web/src/pages/StudyPractice.tsx", import.meta.url),
  "utf8",
);
const types = readFileSync(
  new URL("../apps/web/src/features/study/study-recall-focus.d.mts", import.meta.url),
  "utf8",
);
assert.match(types, /export declare function nextRecallFocus\(/u);
assert.match(page, /nextRecallFocus\(\s*subjectId,\s*round\.ids,\s*round\.position,\s*round\.outcomes,\s*"pending",?\s*\)/u);
assert.match(page, /nextRecallFocus\(\s*subjectId,\s*round\.ids,\s*round\.position,\s*round\.outcomes,\s*"review",?\s*\)/u);
assert.match(page, /const jumpToRecallCategory = \(category: RecallFocusCategory\)/u);
assert.match(page, /previous\.pass === round\.pass && previous\.position === round\.position/u);
assert.match(page, /\? \{ \.\.\.previous, position: next \}/u);
assert.match(page, /disabled=\{nextPendingPosition === null\}/u);
assert.match(page, /disabled=\{nextReviewPosition === null\}/u);
assert.match(page, /jumpToRecallCategory\("pending"\)/u);
assert.match(page, /jumpToRecallCategory\("review"\)/u);
assert.match(page, /communityApi\.question\(currentId, ticket\.signal\)/u);
assert.match(page, /response\.question\.academic\.subject\.id !== subjectId/u);
assert.doesNotMatch(page, /localStorage|sessionStorage|IndexedDB/iu);
console.log("B138 guided within-round focus on pending/review questions PASS");
