import assert from "node:assert/strict";
import {
  ACTIVE_RECALL_MAX_QUESTIONS,
  normalizeRecallQueue,
  nextRecallOutcomes,
  recallSummary,
  recallToStudySession,
} from "../apps/web/src/features/study/study-active-recall.mjs";
import {
  readStudySession,
  serializeStudySession,
} from "../apps/web/src/features/study/study-session-plan.mjs";

const subject = "11111111-1111-4111-8111-111111111111";
const q1 = "22222222-2222-4222-8222-222222222222";
const q2 = "33333333-3333-4333-8333-333333333333";
const queue = normalizeRecallQueue(subject, [q1, q2]);
assert.deepEqual(queue, [q1, q2]);
assert.deepEqual(normalizeRecallQueue(subject.toUpperCase(), [q1.toUpperCase()]), [q1]);
assert.throws(() => normalizeRecallQueue("wrong", [q1]));
assert.throws(() => normalizeRecallQueue(subject, []));
assert.throws(() => normalizeRecallQueue(subject, [q1, q1.toUpperCase()]));
assert.throws(() => normalizeRecallQueue(subject, [q1, "broken"]));
assert.throws(
  () => normalizeRecallQueue(
    subject, Array.from({ length: ACTIVE_RECALL_MAX_QUESTIONS + 1 }, () => q1),
  ),
);
let outcomes = nextRecallOutcomes(queue, {}, q1, "review");
outcomes = nextRecallOutcomes(queue, outcomes, q2, "understood");
assert.deepEqual(recallSummary(queue, outcomes), {
  total: 2, completed: 2, understood: 1, review: 1, pending: 0,
});
assert.deepEqual(recallSummary(queue, {}), {
  total: 2, completed: 0, understood: 0, review: 0, pending: 2,
});
assert.throws(() => nextRecallOutcomes(queue, {}, "44444444-4444-4444-8444-444444444444", "review"));
assert.throws(() => nextRecallOutcomes(queue, {}, q1, "incorrect"));
const exported = recallToStudySession(subject, queue, outcomes);
assert.ok(exported);
assert.equal(exported.tasks.length, 1);
assert.deepEqual(exported.tasks[0], { kind: "question", id: q1, minutes: 20, done: false });
assert.deepEqual(readStudySession(serializeStudySession(exported)), exported);
assert.equal(recallToStudySession(subject, queue, { [q1]: "understood" }), null);
const portable = serializeStudySession(exported);
assert.ok(!portable.includes("respuesta"));
assert.ok(!portable.includes("displayName"));
assert.ok(!portable.includes("body"));
console.log("Study active recall pure contract PASS");
