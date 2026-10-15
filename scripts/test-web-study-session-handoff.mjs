import assert from "node:assert/strict";
import {
  createStudyHandoff,
  finishStudyHandoff,
  inspectStudyHandoff,
  isStudyHandoffRouteState,
  mergeStudySessionHandoff,
  STUDY_HANDOFF_TTL_MS,
} from "../apps/web/src/features/study/study-session-handoff.mjs";
import { emptyStudySession } from "../apps/web/src/features/study/study-session-plan.mjs";

const subject = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const q1 = "33333333-3333-4333-8333-333333333333";
const q2 = "44444444-4444-4444-8444-444444444444";
const scope = "authenticated:alice:session-one";
const stranger = "authenticated:bob:session-two";
const plan = {
  ...emptyStudySession(subject),
  title: "Repasar preguntas",
  tasks: [{ kind: "question", id: q1, minutes: 20, done: false }],
};
const stamp = 1800000000000;
const state = createStudyHandoff(plan, scope, stamp);
assert.equal(isStudyHandoffRouteState(state), true);
assert.deepEqual(Object.keys(state).sort(), ["kind", "token", "version"]);
assert.equal(Object.prototype.hasOwnProperty.call(state, "plan"), false);
assert.equal(inspectStudyHandoff(state, scope, subject, stamp + 1)?.title, plan.title);
assert.equal(inspectStudyHandoff(state, stranger, subject, stamp + 1), null);
assert.equal(inspectStudyHandoff(state, scope, other, stamp + 1), null);
assert.equal(finishStudyHandoff(state, stranger), false);
assert.notEqual(inspectStudyHandoff(state, scope, subject, stamp + 1), null);
assert.equal(finishStudyHandoff(state, scope), true);
assert.equal(finishStudyHandoff(state, scope), false);
assert.equal(inspectStudyHandoff(state, scope, subject, stamp + 1), null);
const expire = createStudyHandoff(plan, scope, stamp);
assert.equal(inspectStudyHandoff(expire, scope, subject, stamp + STUDY_HANDOFF_TTL_MS), null);
assert.equal(inspectStudyHandoff({ ...state, token: other }, scope, subject), null);
assert.equal(isStudyHandoffRouteState({ ...state, payload: plan }), false);

const current = { ...emptyStudySession(subject), tasks: [
  { kind: "question", id: q1, minutes: 45, done: true },
]};
const incoming = { ...plan, tasks: [
  plan.tasks[0],
  { kind: "question", id: q2, minutes: 20, done: false },
]};
const merged = mergeStudySessionHandoff(current, incoming);
assert.equal(merged.added, 1);
assert.equal(merged.plan.tasks[0].minutes, 45);
assert.equal(merged.plan.tasks[0].done, true);
assert.deepEqual(merged.plan.tasks.map((t) => t.id), [q1, q2]);
assert.equal(mergeStudySessionHandoff(merged.plan, incoming).added, 0);
assert.equal(current.tasks.length, 1);
assert.throws(() => mergeStudySessionHandoff(
  current, { ...plan, subjectId: other },
), /STUDY_HANDOFF_SUBJECT_MISMATCH/u);
assert.throws(() => mergeStudySessionHandoff(
  { ...current, tasks: [{...current.tasks[0], minutes:120}] },
  { ...plan, tasks: Array.from({length: 10}, (_, i) => ({
    kind: "question",
    id: `0000000${i}-0000-4000-8000-000000000000`,
    minutes: 120, done: false,
  })) },
), /STUDY_HANDOFF_TIME_LIMIT/u);
console.log("Study session handoff contract PASS");
