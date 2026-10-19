import {
  normalizeRecallQueue,
  retryRecallQueue,
} from "./study-active-recall.mjs";

export const RECALL_GOAL_KINDS = Object.freeze(["classified", "explained"]);
const KINDS = new Set(RECALL_GOAL_KINDS);

function invalid() {
  const error = new Error("RECALL_GOAL_INVALID");
  error.code = "RECALL_GOAL_INVALID";
  throw error;
}

/**
 * B142: Counts only self-selected outcomes for an individual attempt.
 * 'classified' counts either explicit mark; 'explained' counts only the
 * student's explicit "Lo pude explicar" mark. No scores, knowledge claims,
 * clock time, question content, or persistent activity data.
 */
export function measureRecallGoal(subjectId, ids, outcomes, kind, target) {
  const queue = normalizeRecallQueue(subjectId, ids);
  retryRecallQueue(subjectId, queue, outcomes);
  if (!KINDS.has(kind) ||
    !Number.isSafeInteger(target) ||
    target < 1 ||
    target > queue.length) invalid();

  const achieved = queue.reduce((total, id) => {
    const mark = outcomes[id];
    return total +
      (kind === "classified"
        ? Number(mark === "review" || mark === "understood")
        : Number(mark === "understood"));
  }, 0);
  return {
    kind,
    target,
    achieved,
    remaining: Math.max(0, target - achieved),
    met: achieved >= target,
    total: queue.length,
  };
}
