import { normalizeStudySession } from "./study-session-plan.mjs";
import {
  ACTIVE_RECALL_MAX_QUESTIONS,
  normalizeRecallQueue,
  recallSummary,
  retryRecallQueue,
} from "./study-active-recall.mjs";

export const RECALL_REVIEW_DURATIONS = Object.freeze([15, 20, 30, 45]);
export const RECALL_REVIEW_MAX_DAYS_AHEAD = 180;
export const RECALL_ATTEMPT_HISTORY_LIMIT = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

function reject(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

/**
 * Apply the student's explicit review timing to the already validated,
 * question-only Study Session v1 export. No new format, persistence or grants.
 * StudySession's import/handoff flow must still re-check subject and access.
 */
export function organizeRecallSession(source, startsAt, minutes, nowMs = Date.now()) {
  const plan = normalizeStudySession(source);
  if (
    !plan.tasks.length ||
    plan.tasks.length > ACTIVE_RECALL_MAX_QUESTIONS ||
    plan.tasks.some((task) => task.kind !== "question" || task.done)
  ) {
    reject("RECALL_REVIEW_TASKS_INVALID");
  }
  if (!RECALL_REVIEW_DURATIONS.includes(minutes)) {
    reject("RECALL_REVIEW_DURATION_INVALID");
  }
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    reject("RECALL_REVIEW_CLOCK_INVALID");
  }
  const start = startsAt === "" || startsAt === null ? null : startsAt;
  // This also rejects invalid local dates, invalid DST times and malformed
  // or out-of-range datetime-local strings before any file or handoff is made.
  const scheduled = normalizeStudySession({
    ...plan,
    startsAt: start,
    tasks: plan.tasks.map((task) => ({ ...task, minutes })),
  });
  if (scheduled.startsAt !== null) {
    const timestamp = new Date(scheduled.startsAt).getTime();
    if (timestamp < nowMs + 60_000 ||
      timestamp > nowMs + RECALL_REVIEW_MAX_DAYS_AHEAD * DAY_MS) {
      reject("RECALL_REVIEW_TIME_OUT_OF_RANGE");
    }
  }
  return scheduled;
}

function validSnapshot(entry) {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry) ||
    Object.keys(entry).sort().join(",") !==
      "pass,pending,review,total,understood") return false;
  const { pass, pending, review, total, understood } = entry;
  return [pass, pending, review, total, understood]
    .every((value) => Number.isSafeInteger(value) && value >= 0) &&
    pass >= 1 && total >= 1 && total <= ACTIVE_RECALL_MAX_QUESTIONS &&
    pending + review + understood === total;
}

/**
 * Bounded, aggregate-only attempt history for the current tab and round.
 * No question IDs, written reflections, answers, titles or timestamps enter
 * this history. This is a personal activity summary, never an exam grade.
 */
export function recordRecallAttempt(subjectId, history, pass, ids, outcomes) {
  if (!Array.isArray(history) ||
    history.length > RECALL_ATTEMPT_HISTORY_LIMIT ||
    history.some((item) => !validSnapshot(item)) ||
    history.some((item, index) => index > 0 && item.pass <= history[index - 1].pass) ||
    !Number.isSafeInteger(pass) || pass < 1 ||
    (history.length && pass <= history[history.length - 1].pass)) {
    reject("RECALL_ATTEMPT_HISTORY_INVALID");
  }
  const queue = normalizeRecallQueue(subjectId, ids);
  retryRecallQueue(subjectId, queue, outcomes); // strict membership and marks
  const summary = recallSummary(queue, outcomes);
  const snapshot = {
    pass,
    total: summary.total,
    understood: summary.understood,
    review: summary.review,
    pending: summary.pending,
  };
  return [...history.slice(-(RECALL_ATTEMPT_HISTORY_LIMIT - 1)), snapshot];
}
