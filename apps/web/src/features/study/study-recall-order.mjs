import {
  normalizeRecallQueue,
  retryRecallQueue,
} from "./study-active-recall.mjs";

export const RECALL_ORDER_ACTIONS = Object.freeze([
  "earlier",
  "later",
  "review-first",
  "pending-first",
]);
const ACTIONS = new Set(RECALL_ORDER_ACTIONS);

function invalid() {
  const error = new Error("RECALL_ORDER_INVALID");
  error.code = "RECALL_ORDER_INVALID";
  throw error;
}

/**
 * Reorder the current, authenticated subject's opaque question IDs without
 * modifying self-assessments, typed reflections, reveal flags or attempt
 * history. The selected question remains selected by ID, not by index.
 *
 * Returns null when a valid action would not change the queue. This is
 * personal organization, never an inferred score or learning prediction.
 * All IDs must be re-authorized by the existing question-detail flow.
 */
export function organizeRecallQueue(
  subjectId,
  ids,
  position,
  outcomes,
  action,
) {
  const queue = normalizeRecallQueue(subjectId, ids);
  if (
    !Number.isSafeInteger(position) ||
    position < 0 ||
    position >= queue.length ||
    !ACTIONS.has(action)
  ) {
    invalid();
  }
  retryRecallQueue(subjectId, queue, outcomes);
  const selectedId = queue[position];
  let ordered;
  if (action === "earlier" || action === "later") {
    const target = position + (action === "earlier" ? -1 : 1);
    if (target < 0 || target >= queue.length) return null;
    ordered = [...queue];
    [ordered[position], ordered[target]] = [ordered[target], ordered[position]];
  } else {
    const priority = (id) => {
      const mark = outcomes[id];
      if (action === "review-first") {
        return mark === "review" ? 0 : mark === undefined ? 1 : 2;
      }
      return mark === undefined ? 0 : mark === "review" ? 1 : 2;
    };
    // Stable sort: original order within each self-assessment category.
    ordered = queue
      .map((id, index) => ({ id, index, rank: priority(id) }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map((entry) => entry.id);
  }
  if (ordered.every((id, index) => id === queue[index])) return null;
  return {
    ids: ordered,
    position: ordered.indexOf(selectedId),
  };
}
