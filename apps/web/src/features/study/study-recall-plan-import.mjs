import { readStudySession } from "./study-session-plan.mjs";
import { normalizeRecallQueue } from "./study-active-recall.mjs";
import { RECALL_REVIEW_DURATIONS } from "./study-recall-planning.mjs";

export const ACTIVE_RECALL_PLAN_FILE_LIMIT = 64000;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

/**
 * Parse a portable Study Session v1 review plan into an opaque, subject-scoped
 * question queue. Import never implies authorization. Every question must be
 * fetched afresh from the authoritative API *before* a round is started.
 */
export function importRecallReviewPlan(subjectId, text) {
  const plan = readStudySession(text);
  // Never allow a foreign subject, even if every ID exists in another context.
  if (plan.subjectId !== subjectId?.toLowerCase()) {
    fail("RECALL_PLAN_SUBJECT_MISMATCH");
  }
  if (!plan.tasks.length ||
    plan.tasks.some((task) => task.kind !== "question" || task.done)) {
    fail("RECALL_PLAN_QUESTION_ONLY");
  }
  const ids = normalizeRecallQueue(subjectId, plan.tasks.map((task) => task.id));
  const minutes = plan.tasks[0].minutes;
  if (!RECALL_REVIEW_DURATIONS.includes(minutes) ||
    plan.tasks.some((task) => task.minutes !== minutes)) {
    fail("RECALL_PLAN_DURATION_INVALID");
  }
  // Deliberately never return title/notes: third-party or portable file text
  // must not be displayed or treated as verified academic content.
  return {
    ids,
    startsAt: plan.startsAt ?? "",
    minutes,
  };
}
