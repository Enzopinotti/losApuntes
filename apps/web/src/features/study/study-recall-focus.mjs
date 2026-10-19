import {
  normalizeRecallQueue,
  retryRecallQueue,
} from "./study-active-recall.mjs";

const CATEGORIES = new Set(["pending", "review"]);

function invalid() {
  const error = new Error("RECALL_FOCUS_INVALID");
  error.code = "RECALL_FOCUS_INVALID";
  throw error;
}

/**
 * Navigate between the student's own pending/review marks inside a single
 * subject-scoped round. Returns null if there is no *other* matching item.
 *
 * Never infers grades from unmarked questions or reads cached server content.
 * Starts strictly after the current index, wraps once and excludes current.
 * React caller must re-fetch each selected question with authority guards.
 */
export function nextRecallFocus(
  subjectId,
  ids,
  position,
  outcomes,
  category,
) {
  const queue = normalizeRecallQueue(subjectId, ids);
  if (
    !Number.isSafeInteger(position) ||
    position < 0 ||
    position >= queue.length ||
    !CATEGORIES.has(category)
  ) {
    invalid();
  }
  // Strictly reject marks for unrelated question IDs and malformed outcomes.
  retryRecallQueue(subjectId, queue, outcomes);
  for (let offset = 1; offset < queue.length; offset += 1) {
    const index = (position + offset) % queue.length;
    const outcome = outcomes[queue[index]];
    if (
      (category === "pending" && outcome === undefined) ||
      (category === "review" && outcome === "review")
    ) {
      return index;
    }
  }
  return null;
}
