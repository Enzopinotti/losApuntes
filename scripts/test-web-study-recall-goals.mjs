import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  measureRecallGoal,
  RECALL_GOAL_KINDS,
} from "../apps/web/src/features/study/study-recall-goals.mjs";
import {
  normalizeRecallQueue,
  nextRecallOutcomes,
  recallSummary,
} from "../apps/web/src/features/study/study-active-recall.mjs";
import {
  organizeRecallQueue,
} from "../apps/web/src/features/study/study-recall-order.mjs";
import {
  planRecallClosure,
} from "../apps/web/src/features/study/study-recall-closure.mjs";

const subject = "11111111-1111-4111-8111-111111111111";
const q1 = "a2222222-2222-4222-8222-222222222222";
const q2 = "b3333333-3333-4333-8333-333333333333";
const q3 = "c4444444-4444-4444-8444-444444444444";
const q4 = "d5555555-5555-4555-8555-555555555555";
const foreign = "99999999-9999-4999-8999-999999999999";
const ids = normalizeRecallQueue(subject, [q1, q2, q3, q4]);
const marks = { [q1]: "understood", [q3]: "review" };
const original = JSON.stringify({ ids, marks });
assert.deepEqual(RECALL_GOAL_KINDS, ["classified", "explained"]);

// Explicitly classified means any user classification, NOT a grade.
// Explicitly explained only counts the student's own "Lo pude explicar".
assert.deepEqual(measureRecallGoal(subject, ids, {}, "classified", 3), {
  kind: "classified", target: 3, achieved: 0, remaining: 3, met: false, total: 4,
});
assert.deepEqual(measureRecallGoal(subject, ids, marks, "classified", 3), {
  kind: "classified", target: 3, achieved: 2, remaining: 1, met: false, total: 4,
});
assert.deepEqual(measureRecallGoal(subject, ids, marks, "explained", 2), {
  kind: "explained", target: 2, achieved: 1, remaining: 1, met: false, total: 4,
});
const completeMarks = nextRecallOutcomes(ids, marks, q2, "understood");
assert.deepEqual(measureRecallGoal(subject, ids, completeMarks, "classified", 3), {
  kind: "classified", target: 3, achieved: 3, remaining: 0, met: true, total: 4,
});
assert.deepEqual(measureRecallGoal(subject, ids, completeMarks, "explained", 2), {
  kind: "explained", target: 2, achieved: 2, remaining: 0, met: true, total: 4,
});
assert.deepEqual(measureRecallGoal(subject, ids, marks, "explained", 1), {
  kind: "explained", target: 1, achieved: 1, remaining: 0, met: true, total: 4,
});
assert.equal(JSON.stringify({ ids, marks }), original, "pure model must never mutate");
assert.equal(measureRecallGoal(subject, [q3], { [q3]: "review" }, "explained", 1).met, false);
assert.equal(measureRecallGoal(subject, [q3], { [q3]: "review" }, "classified", 1).met, true);

// Reordering does not affect a personal goal or derive extra progress.
const sorted = organizeRecallQueue(subject, ids, 0, marks, "review-first");
assert.ok(sorted);
assert.deepEqual(
  measureRecallGoal(subject, sorted.ids, marks, "classified", 3),
  measureRecallGoal(subject, ids, marks, "classified", 3),
);
assert.deepEqual(
  recallSummary(sorted.ids, marks),
  recallSummary(ids, marks),
);
assert.equal(
  planRecallClosure(subject, sorted.ids, marks, 20).phase, "classify",
);
assert.deepEqual(
  measureRecallGoal(subject.toUpperCase(), ids.map(x => x.toUpperCase()),
    marks, "explained", 2),
  measureRecallGoal(subject, ids, marks, "explained", 2),
);

// No extra, foreign, malformed, duplicated or unrecognized marks/goal types.
const invalid = [
  [subject, ids, marks, "classified", 0],
  [subject, ids, marks, "classified", 5],
  [subject, ids, marks, "classified", -1],
  [subject, ids, marks, "classified", 1.5],
  [subject, ids, marks, "classified", "2"],
  [subject, ids, marks, "classified", Infinity],
  [subject, ids, marks, "unknown", 1],
  [subject, ids, marks, null, 1],
  [subject, ids, null, "classified", 1],
  [subject, ids, [], "classified", 1],
  [subject, ids, new Date(), "classified", 1],
  [subject, ids, { [foreign]: "review" }, "classified", 1],
  [subject, ids, { [q1]: "grade-A" }, "classified", 1],
  [subject, [q1, q1], {}, "classified", 1],
  [subject, [], {}, "classified", 1],
  ["invalid", ids, {}, "classified", 1],
];
for (const args of invalid) {
  assert.throws(() => measureRecallGoal(...args));
}
assert.throws(
  () => measureRecallGoal(subject, ids, marks, "classified", 0),
  /RECALL_GOAL_INVALID/u,
);

// Progress aggregates never reveal question UUIDs, user identity, grades,
// reflections or third-party content.
const aggregate = JSON.stringify(measureRecallGoal(subject, ids, marks, "classified", 2));
for (const sensitive of [subject, ...ids, "question", "answer", "userId",
  "reflection", "grade", "token", "createdAt"]) {
  assert.equal(aggregate.includes(sensitive), false);
}

const page = readFileSync(
  new URL("../apps/web/src/pages/StudyPractice.tsx", import.meta.url), "utf8",
);
const types = readFileSync(
  new URL("../apps/web/src/features/study/study-recall-goals.d.mts", import.meta.url), "utf8",
);
assert.match(types, /export declare function measureRecallGoal\(/u);
assert.match(page, /const \[goalDraftState, setGoalDraftState\] = useState/u);
assert.match(page, /const \[goalState, setGoalState\] = useState/u);
assert.match(page, /goalState\?\.scope === scope/u);
assert.match(page, /goalState\.pass === round\.pass/u);
assert.match(page, /goalState\.activation === activationId/u);
assert.match(page, /measureRecallGoal\(/u);
assert.match(page, /const savePracticeGoal = \(\) =>/u);
assert.match(page, /onClick=\{savePracticeGoal\}/u);
assert.match(page, /onClick=\{\(\) => setGoalState\(null\)\}/u);
assert.match(page, /value=\{goalDraft\.kind\}/u);
assert.match(page, /value=\{goalDraft\.target\}/u);
assert.match(page, /goalProgress\.achieved/u);
assert.match(page, /max=\{goalProgress\.target\}/u);
assert.match(page, /aria-label="Avance del objetivo personal"/u);
assert.match(page, /setGoalState\(null\)/u);
assert.match(page, /setGoalDraftState\(null\)/u);
assert.match(page, /STUDY_PROGRESS_ENABLED|no es una/u);
assert.doesNotMatch(page, /localStorage|sessionStorage|IndexedDB/iu);
console.log("B142 private per-attempt goal progress and Web integration PASS");
