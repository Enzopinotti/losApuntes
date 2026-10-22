import {
  emptyStudySession,
  normalizeStudySession,
} from "./study-session-plan.mjs";

export const ACTIVE_RECALL_MAX_QUESTIONS = 10;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const OUTCOMES = new Set(["understood", "review"]);

function invalid(message) {
  const error = new Error(message);
  error.code = message;
  throw error;
}

export function normalizeRecallQueue(subjectId, ids) {
  if (
    typeof subjectId !== "string" ||
    !UUID_V4.test(subjectId) ||
    !Array.isArray(ids) ||
    ids.length < 1 ||
    ids.length > ACTIVE_RECALL_MAX_QUESTIONS
  ) {
    invalid("ACTIVE_RECALL_QUEUE_INVALID");
  }
  const seen = new Set();
  return ids.map((id) => {
    if (typeof id !== "string" || !UUID_V4.test(id)) {
      invalid("ACTIVE_RECALL_ID_INVALID");
    }
    const canonical = id.toLowerCase();
    if (seen.has(canonical)) invalid("ACTIVE_RECALL_DUPLICATE");
    seen.add(canonical);
    return canonical;
  });
}

/**
 * Choose only questions explicitly marked for review for a new, manual
 * practice attempt. IDs remain opaque and subject-scoped; the caller must
 * fetch each question again before displaying its content or answers.
 *
 * No saved answers, titles, scores, or cross-session persistence.
 */
export function retryRecallQueue(subjectId, ids, outcomes) {
  const queue = normalizeRecallQueue(subjectId, ids);
  if (
    outcomes === null ||
    typeof outcomes !== "object" ||
    Array.isArray(outcomes) ||
    (Object.getPrototypeOf(outcomes) !== Object.prototype &&
      Object.getPrototypeOf(outcomes) !== null)
  ) {
    invalid("ACTIVE_RECALL_RETRY_INVALID");
  }
  const known = new Set(queue);
  if (Object.keys(outcomes).length > queue.length) {
    invalid("ACTIVE_RECALL_RETRY_INVALID");
  }
  for (const [id, outcome] of Object.entries(outcomes)) {
    if (!known.has(id) || !OUTCOMES.has(outcome)) {
      invalid("ACTIVE_RECALL_RETRY_INVALID");
    }
  }
  const retry = queue.filter((id) => outcomes[id] === "review");
  return retry.length ? retry : null;
}

export function nextRecallOutcomes(queue, previous, questionId, outcome) {
  if (
    !Array.isArray(queue) ||
    !queue.includes(questionId) ||
    !OUTCOMES.has(outcome)
  ) {
    invalid("ACTIVE_RECALL_OUTCOME_INVALID");
  }
  const next = {};
  for (const id of queue) {
    const value = previous?.[id];
    if (OUTCOMES.has(value)) next[id] = value;
  }
  next[questionId] = outcome;
  return next;
}

export function recallSummary(queue, outcomes) {
  const current = Array.isArray(queue) ? queue : [];
  let understood = 0;
  let review = 0;
  for (const id of current) {
    const outcome = outcomes?.[id];
    if (outcome === "understood") understood += 1;
    if (outcome === "review") review += 1;
  }
  return {
    total: current.length,
    completed: understood + review,
    understood,
    review,
    pending: current.length - understood - review,
  };
}

/**
 * Export only opaque Question UUIDs explicitly marked for review. This does
 * not persist answers/other people's titles and never grants resource access.
 * Existing Study Session v1 import revalidates each Question with the server.
 */
export function recallToStudySession(subjectId, queue, outcomes) {
  const canonical = normalizeRecallQueue(subjectId, queue);
  const needsReview = canonical.filter((id) => outcomes?.[id] === "review");
  if (needsReview.length === 0) return null;
  const empty = emptyStudySession(subjectId);
  return normalizeStudySession({
    ...empty,
    title: "Repasar preguntas pendientes",
    notes: "",
    tasks: needsReview.map((id) => ({
      kind: "question",
      id,
      minutes: 20,
      done: false,
    })),
  });
}
