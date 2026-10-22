import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeRecallQueue,
  nextRecallOutcomes,
  recallSummary,
  retryRecallQueue,
} from "../apps/web/src/features/study/study-active-recall.mjs";

const subject = "11111111-1111-4111-8111-111111111111";
const q1 = "a2222222-2222-4222-8222-222222222222";
const q2 = "b3333333-3333-4333-8333-333333333333";
const q3 = "c4444444-4444-4444-8444-444444444444";
const queue = normalizeRecallQueue(subject, [q1, q2, q3]);

// A manual retry preserves the user's original question order, but includes
// only explicit REVIEW selections. Unrated and UNDERSTOOD are never inferred.
const outcomes = nextRecallOutcomes(
  queue,
  nextRecallOutcomes(queue, {}, q3, "review"),
  q1,
  "review",
);
const before = JSON.stringify(outcomes);
assert.deepEqual(retryRecallQueue(subject, queue, outcomes), [q1, q3]);
assert.equal(JSON.stringify(outcomes), before);
assert.deepEqual(queue, [q1, q2, q3]);
assert.equal(retryRecallQueue(subject, queue, { [q1]: "understood" }), null);
assert.equal(retryRecallQueue(subject, queue, {}), null);
assert.deepEqual(retryRecallQueue(subject.toUpperCase(), [q1.toUpperCase()], {
  [q1]: "review",
}), [q1]);

// Next attempt must begin with no marks or claimed score; the only carry-over
// is the opaque question selection, not previous notes or server content.
const retry = retryRecallQueue(subject, queue, outcomes);
assert.ok(retry);
assert.deepEqual(recallSummary(retry, {}), {
  total: 2, completed: 0, understood: 0, review: 0, pending: 2,
});
const second = nextRecallOutcomes(retry, {}, q1, "understood");
assert.deepEqual(retryRecallQueue(subject, retry, second), null);

for (const invalid of [null, [], "review", 4, { [q1]: "correct" },
  { [q1]: "review", unexpected: "understood" },
  { [q2.toUpperCase()]: "review" },
  { [q1]: "review", [q2]: "review", [q3]: "review", unexpected: "review" },
]) {
  assert.throws(() => retryRecallQueue(subject, queue, invalid),
    /ACTIVE_RECALL_RETRY_INVALID/u);
}
assert.throws(() => retryRecallQueue(subject, [q1, q1], { [q1]: "review" }),
  /ACTIVE_RECALL_DUPLICATE/u);
assert.throws(() => retryRecallQueue("not-a-subject", queue, {}),
  /ACTIVE_RECALL_QUEUE_INVALID/u);
assert.throws(() => retryRecallQueue(subject, [q1, "invalid"], {}),
  /ACTIVE_RECALL_ID_INVALID/u);
assert.throws(() => retryRecallQueue(subject, queue, new Date()),
  /ACTIVE_RECALL_RETRY_INVALID/u);

// Verify the actual screen uses an attempt-specific server-data key. Starting
// a retry with the same first ID cannot show stale cached details or answers.
const page = readFileSync(
  new URL("../apps/web/src/pages/StudyPractice.tsx", import.meta.url),
  "utf8",
);
const types = readFileSync(
  new URL("../apps/web/src/features/study/study-active-recall.d.mts", import.meta.url),
  "utf8",
);
assert.match(types, /export declare function retryRecallQueue\(/u);
assert.match(page, /retryRecallQueue\(subjectId, round\.ids, round\.outcomes\)/u);
assert.match(page, /attempt-\$\{round\?\.pass \?\? 0\}/u);
assert.match(page, /pass: previous\.pass \+ 1/u);
assert.match(page, /revealedIds: \[\],\s*outcomes: \{\},\s*reflections: \{\}/u);
assert.match(page, /previous\?\.scope === scope && previous\.pass === round\.pass/u);
assert.match(page, /communityApi\.question\(currentId, ticket\.signal\)/u);
assert.match(page, /response\.question\.academic\.subject\.id !== subjectId/u);
assert.match(page, /if \(detailCurrent\(ticket\)\)/u);
assert.match(page, /const shownAnswers = revealed \?/u);
assert.match(page, /window\.confirm\(/u);
assert.match(page, /disabled=\{!summary\?\.review\}/u);
assert.match(page, /onClick=\{retryMarkedQuestions\}/u);
assert.match(page, /Intento \{round\.pass\}/u);
assert.doesNotMatch(page, /localStorage|sessionStorage|IndexedDB/iu);
console.log("B134 private retry of review-marked questions PASS");
