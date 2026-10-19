import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RECALL_REVIEW_DURATIONS,
  RECALL_REVIEW_MAX_DAYS_AHEAD,
  RECALL_ATTEMPT_HISTORY_LIMIT,
  organizeRecallSession,
  recordRecallAttempt,
} from "../apps/web/src/features/study/study-recall-planning.mjs";
import {
  recallToStudySession,
  retryRecallQueue,
} from "../apps/web/src/features/study/study-active-recall.mjs";
import {
  normalizeStudySession,
  serializeStudySession,
  readStudySession,
} from "../apps/web/src/features/study/study-session-plan.mjs";

const subject = "11111111-1111-4111-8111-111111111111";
const q1 = "a2222222-2222-4222-8222-222222222222";
const q2 = "b3333333-3333-4333-8333-333333333333";
const q3 = "c4444444-4444-4444-8444-444444444444";
const ids = [q1, q2, q3];
const outcomes = { [q1]: "review", [q2]: "understood", [q3]: "review" };
const base = recallToStudySession(subject, ids, outcomes);
assert.ok(base);
assert.deepEqual(base.tasks.map((task) => task.id), [q1, q3]);
assert.deepEqual(RECALL_REVIEW_DURATIONS, [15, 20, 30, 45]);
assert.equal(RECALL_REVIEW_MAX_DAYS_AHEAD, 180);

const now = new Date(2026, 9, 19, 9, 0).getTime();
const scheduled = organizeRecallSession(base, "2026-10-20T10:30", 30, now);
assert.equal(scheduled.startsAt, "2026-10-20T10:30");
assert.equal(scheduled.tasks.length, 2);
assert.deepEqual(scheduled.tasks.map((task) => task.minutes), [30, 30]);
assert.deepEqual(scheduled.tasks.map((task) => task.done), [false, false]);
assert.equal(scheduled.subjectId, subject);
assert.equal(base.startsAt, null, "original plan must not mutate");
assert.equal(base.tasks[0].minutes, 20);
assert.deepEqual(readStudySession(serializeStudySession(scheduled)), scheduled);
for (const value of ["", null]) {
  const unscheduled = organizeRecallSession(base, value, 15, now);
  assert.equal(unscheduled.startsAt, null);
  assert.deepEqual(unscheduled.tasks.map((task) => task.minutes), [15, 15]);
}

for (const minutes of [0, -1, 10, 21, 31, 121, Infinity, NaN, "20", null]) {
  assert.throws(
    () => organizeRecallSession(base, null, minutes, now),
    /RECALL_REVIEW_DURATION_INVALID/u,
  );
}
for (const badTime of [
  "2026-10-19T08:00", "2026-10-19T09:00",
  "2027-10-19T10:30",
]) {
  assert.throws(
    () => organizeRecallSession(base, badTime, 20, now),
    /RECALL_REVIEW_TIME_OUT_OF_RANGE/u,
  );
}
for (const badTime of ["yesterday", "2026-02-30T12:00", "2026-10-19",
  "2026-10-20T25:00", "2026-10-20T10:30Z", 42]) {
  assert.throws(
    () => organizeRecallSession(base, badTime, 20, now),
    /STUDY_SESSION_START_INVALID/u,
  );
}
assert.throws(
  () => organizeRecallSession(base, null, 20, -1),
  /RECALL_REVIEW_CLOCK_INVALID/u,
);
assert.throws(
  () => organizeRecallSession({ ...base, tasks: [] }, null, 20, now),
  /RECALL_REVIEW_TASKS_INVALID/u,
);
assert.throws(
  () => organizeRecallSession(normalizeStudySession({
    ...base, tasks: [{ kind: "resource", id: q1, minutes: 20, done: false }],
  }), null, 20, now),
  /RECALL_REVIEW_TASKS_INVALID/u,
);
assert.throws(
  () => organizeRecallSession({ ...base, tasks: base.tasks.map((task) => ({ ...task, done: true })) }, null, 20, now),
  /RECALL_REVIEW_TASKS_INVALID/u,
);

// Snapshot history is aggregate-only, monotonically ordered and bounded.
let history = recordRecallAttempt(subject, [], 1, ids, outcomes);
assert.deepEqual(history, [
  { pass: 1, total: 3, understood: 1, review: 2, pending: 0 },
]);
assert.equal(JSON.stringify(history).includes(q1), false);
assert.equal(JSON.stringify(history).includes(subject), false);
assert.deepEqual(retryRecallQueue(subject, ids, outcomes), [q1, q3]);

history = recordRecallAttempt(
  subject, history, 2, [q1, q3], { [q1]: "understood" },
);
assert.deepEqual(history[1], {
  pass: 2, total: 2, understood: 1, review: 0, pending: 1,
});
assert.deepEqual(history[0], {
  pass: 1, total: 3, understood: 1, review: 2, pending: 0,
});
assert.equal(RECALL_ATTEMPT_HISTORY_LIMIT, 8);
for (let pass = 3; pass <= 12; pass += 1) {
  history = recordRecallAttempt(subject, history, pass, [q1], {});
}
assert.equal(history.length, 8);
assert.deepEqual(history.map((item) => item.pass), [5, 6, 7, 8, 9, 10, 11, 12]);

for (const bad of [
  null, {}, [{ pass: 1, total: 2, understood: 1, review: 2, pending: 0 }],
  [{ pass: 1, total: 1, understood: 1, review: 0, pending: 0, answer: "private" }],
  [history[1], history[0]],
]) {
  assert.throws(
    () => recordRecallAttempt(subject, bad, 13, [q1], {}),
    /RECALL_ATTEMPT_HISTORY_INVALID/u,
  );
}
assert.throws(
  () => recordRecallAttempt(subject, history, 12, [q1], {}),
  /RECALL_ATTEMPT_HISTORY_INVALID/u,
);
assert.throws(
  () => recordRecallAttempt(subject, history, 13, [q1], { [q2]: "review" }),
  /ACTIVE_RECALL_RETRY_INVALID/u,
);

// Real UI: schedule shared by both export and planner handoff, state limited
// to auth/subject scope and aggregate-only history, no persistent storage.
const page = readFileSync(
  new URL("../apps/web/src/pages/StudyPractice.tsx", import.meta.url), "utf8",
);
const types = readFileSync(
  new URL("../apps/web/src/features/study/study-recall-planning.d.mts", import.meta.url), "utf8",
);
assert.match(types, /export declare function organizeRecallSession\(/u);
assert.match(types, /export declare function recordRecallAttempt\(/u);
assert.match(page, /reviewSettings\?\.scope === scope/u);
assert.match(page, /recordRecallAttempt\(\s*subjectId,\s*round\.history/u);
assert.match(page, /history: \[\]/u);
assert.match(page, /history,\s*ids,/u);
assert.match(page, /round\.history\.map\(/u);
assert.match(page, /type="datetime-local"/u);
assert.match(page, /RECALL_REVIEW_DURATIONS\.map\(/u);
assert.match(page, /organizeRecallSession\(/u);
assert.match(page, /createStudyHandoff\(organized, scope\)/u);
assert.match(page, /serializeStudySession\(organized\)/u);
assert.match(page, /STUDY_PROGRESS_ENABLED|Sin notas persistidas ni calificaciones públicas/u);
assert.doesNotMatch(page, /localStorage|sessionStorage|IndexedDB/iu);
console.log("B135 scheduled reviews and private attempt history PASS");
