import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  createTaskClock,
  remainingTaskClock,
  pauseTaskClock,
  startTaskClock,
  updateRunTask,
  runSummary,
} from "../apps/web/src/features/study/study-session-run-clock.mjs";
import {
  emptyStudySession,
  serializeStudySession,
  readStudySession,
} from "../apps/web/src/features/study/study-session-plan.mjs";

const subject = "dc9f533a-2e78-4bbd-9ca8-f3a09f9c278a";
const resource = "dec97b45-299b-4e7b-8dd2-2467a671b5a7";
const question = "adec9121-9765-4be1-977a-994272804eab";
const plan = {
  ...emptyStudySession(subject),
  title: "Repasar antes del parcial",
  tasks: [
    { kind: "resource", id: resource, minutes: 25, done: false },
    { kind: "question", id: question, minutes: 15, done: false },
  ],
};

let cases = 0;
function verify(name, callback) {
  callback();
  cases += 1;
  process.stdout.write("PASS " + name + "\n");
}

verify("initial task clock", () => {
  assert.deepEqual(createTaskClock(25), { remainingMs: 1500000, startedAt: null });
});
verify("start measures elapsed wall time", () => {
  const started = startTaskClock(createTaskClock(25), 1000);
  assert.equal(remainingTaskClock(started, 61000), 1440000);
});
verify("pause snapshots elapsed time", () => {
  const paused = pauseTaskClock(startTaskClock(createTaskClock(25), 1000), 61000);
  assert.deepEqual(paused, { remainingMs: 1440000, startedAt: null });
  assert.equal(remainingTaskClock(paused, 99999999), 1440000);
});
verify("resume never restores elapsed seconds", () => {
  const first = pauseTaskClock(startTaskClock(createTaskClock(25), 1000), 61000);
  const next = startTaskClock(first, 500000);
  assert.equal(remainingTaskClock(next, 560000), 1380000);
});
verify("elapsed never negative or greater than initial", () => {
  const running = startTaskClock(createTaskClock(5), 1000);
  assert.equal(remainingTaskClock(running, 0), 300000);
  assert.equal(remainingTaskClock(running, 400000), 0);
  assert.equal(startTaskClock(running, 500000).startedAt, null);
  assert.equal(pauseTaskClock(running, 999999).remainingMs, 0);
});
verify("reject negative/overflow durations and invalid timestamps", () => {
  for (const minutes of [0, 3, 5.5, 121, NaN, Infinity]) {
    assert.throws(() => createTaskClock(minutes), /STUDY_RUN_MINUTES_INVALID/);
  }
  assert.throws(() => startTaskClock(createTaskClock(5), -1), /STUDY_RUN_CLOCK_INVALID/);
  assert.throws(() => remainingTaskClock({ remainingMs: -1, startedAt: null }, 1000));
});
verify("mark completion is immutable and stable", () => {
  const done = updateRunTask(plan, "resource", resource, true);
  assert.equal(done.tasks[0].done, true);
  assert.equal(done.tasks[1].done, false);
  assert.equal(plan.tasks[0].done, false);
  assert.equal(updateRunTask(done, "resource", resource, false).tasks[0].done, false);
});
verify("cannot mark unknown ids or invalid kinds", () => {
  assert.throws(() => updateRunTask(plan, "resource", question, true), /STUDY_RUN_TASK_INVALID/);
  assert.throws(() => updateRunTask(plan, "question", question, "yes"), /STUDY_RUN_TASK_INVALID/);
});
verify("summary tracks declared progress, not automatic grades", () => {
  const done = updateRunTask(plan, "question", question, true);
  assert.deepEqual(runSummary(done), {
    total: 2, done: 1, remaining: 1, totalMinutes: 40, doneMinutes: 15,
  });
});
verify("updated JSON is backwards compatible with Study Session v1", () => {
  const done = updateRunTask(plan, "resource", resource, true);
  const decoded = readStudySession(serializeStudySession(done));
  assert.deepEqual(decoded, done);
  assert.equal("answers" in decoded, false);
});

const root = process.cwd();
const files = await Promise.all([
  "apps/web/src/pages/StudyRunner.tsx",
  "apps/web/src/pages/StudySession.tsx",
  "apps/web/src/app/routes.tsx",
].map((file) => readFile(path.join(root, file), "utf8")));
const [runner, planner, routes] = files;
verify("only a private route exposes execution", () => {
  assert.match(routes, /path: "study\/run"[\s\S]*?<PrivateRoute>[\s\S]*?<StudyRunner \/>/u);
});
verify("planner creates session-scoped handoff", () => {
  assert.match(planner, /Realizar esta sesión/u);
  assert.match(planner, /rememberStudyDraft\(scope, portable\)/u);
});
verify("import is bounded and subject-scoped", () => {
  assert.match(runner, /file\.size > 64000/u);
  assert.match(runner, /imported\.subjectId !== subjectId/u);
  assert.match(runner, /normalizeStudySession\(source\)/u);
  assert.match(runner, /recallStudyDraft\(scope, subjectId\)/u);
});
verify("no cached titles or local browser storage", () => {
  assert.doesNotMatch(runner, /localStorage|sessionStorage|indexedDB/u);
  assert.match(runner, /verifiedTaskLabel\(plan, task, ticket\.signal\)/u);
  assert.match(runner, /loadCurrent\(ticket\)/u);
});
verify("permission is rechecked before self-assessment", () => {
  assert.match(runner, /verifiedTaskLabel\(runner\.plan, task, ticket\.signal\)/u);
  assert.match(runner, /updateRunTask\(old\.plan, task\.kind, task\.id, !task\.done\)/u);
});
verify("visibility pauses and activity changes snapshot clocks", () => {
  assert.match(runner, /visibilitychange/u);
  assert.match(runner, /pauseTaskClock\(old\.clocks\[key\], Date\.now\(\)\)/u);
});
console.log("PASS " + cases + " functional/model/contract scenarios");
