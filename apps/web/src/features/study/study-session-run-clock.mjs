import { normalizeStudySession } from "./study-session-plan.mjs";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function checkNow(now) {
  if (!Number.isSafeInteger(now) || now < 0) fail("STUDY_RUN_CLOCK_INVALID");
}

function checkClock(clock) {
  if (
    !clock || typeof clock !== "object" ||
    !Number.isSafeInteger(clock.remainingMs) || clock.remainingMs < 0 ||
    clock.remainingMs > 120 * 60000 ||
    (clock.startedAt !== null &&
      (!Number.isSafeInteger(clock.startedAt) || clock.startedAt < 0))
  ) fail("STUDY_RUN_CLOCK_INVALID");
}

export function createTaskClock(minutes) {
  if (!Number.isSafeInteger(minutes) || minutes < 5 || minutes > 120 || minutes % 5 !== 0) {
    fail("STUDY_RUN_MINUTES_INVALID");
  }
  return { remainingMs: minutes * 60000, startedAt: null };
}

export function remainingTaskClock(clock, now) {
  checkNow(now);
  checkClock(clock);
  if (clock.startedAt === null) return clock.remainingMs;
  // Clock changes and suspended tabs must never produce negative time.
  return Math.max(0, clock.remainingMs - Math.max(0, now - clock.startedAt));
}

export function pauseTaskClock(clock, now) {
  return { remainingMs: remainingTaskClock(clock, now), startedAt: null };
}

export function startTaskClock(clock, now) {
  const remainingMs = remainingTaskClock(clock, now);
  return {
    remainingMs,
    startedAt: remainingMs === 0 ? null : now,
  };
}

export function updateRunTask(plan, kind, id, done) {
  const normalized = normalizeStudySession(plan);
  if (typeof done !== "boolean" || (kind !== "resource" && kind !== "question") ||
      typeof id !== "string") fail("STUDY_RUN_TASK_INVALID");
  const index = normalized.tasks.findIndex((task) => task.kind === kind && task.id === id);
  if (index < 0) fail("STUDY_RUN_TASK_INVALID");
  return normalizeStudySession({
    ...normalized,
    tasks: normalized.tasks.map((task, i) => i === index ? { ...task, done } : task),
  });
}

export function runSummary(plan) {
  const current = normalizeStudySession(plan);
  return {
    total: current.tasks.length,
    done: current.tasks.filter((task) => task.done).length,
    remaining: current.tasks.filter((task) => !task.done).length,
    totalMinutes: current.tasks.reduce((sum, task) => sum + task.minutes, 0),
    doneMinutes: current.tasks.filter((task) => task.done)
      .reduce((sum, task) => sum + task.minutes, 0),
  };
}
