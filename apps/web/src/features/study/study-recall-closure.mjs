import {
  normalizeRecallQueue,
  retryRecallQueue,
} from "./study-active-recall.mjs";
import { RECALL_REVIEW_DURATIONS } from "./study-recall-planning.mjs";

function invalid() {
  const error = new Error("RECALL_CLOSURE_INVALID");
  error.code = "RECALL_CLOSURE_INVALID";
  throw error;
}

/**
 * Aggregate-only guided closeout. Never infer that an unclassified question
 * was incorrect, or that an explanation is an academic grade. An ID is
 * returned only as its position in the current, validated, subject-scoped
 * queue; the screen must use its existing server authority fence.
 */
export function planRecallClosure(subjectId, ids, outcomes, minutes) {
  const queue = normalizeRecallQueue(subjectId, ids);
  retryRecallQueue(subjectId, queue, outcomes);
  if (!RECALL_REVIEW_DURATIONS.includes(minutes)) invalid();

  let pending = 0;
  let review = 0;
  let understood = 0;
  let firstPending = null;
  let firstReview = null;
  queue.forEach((id, position) => {
    const value = outcomes[id];
    if (value === undefined) {
      pending += 1;
      if (firstPending === null) firstPending = position;
    } else if (value === "review") {
      review += 1;
      if (firstReview === null) firstReview = position;
    } else {
      understood += 1;
    }
  });
  return {
    phase: pending > 0 ? "classify" : review > 0 ? "review" : "ready",
    total: queue.length,
    pending,
    review,
    understood,
    firstPending,
    firstReview,
    estimatedReviewMinutes: review * minutes,
  };
}
