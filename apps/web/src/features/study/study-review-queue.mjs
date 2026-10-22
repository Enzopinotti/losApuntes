import { normalizeStudySession } from "./study-session-plan.mjs";

const MARKS = new Set(["repeat", "reinforce", "confident"]);
const MODES = new Set(["all", "priority", "reinforce"]);

function invalid(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function taskKey(task) {
  return task.kind + ":" + task.id;
}

function checkedMarks(plan, marks) {
  if (
    marks === null || typeof marks !== "object" ||
    Array.isArray(marks) ||
    (Object.getPrototypeOf(marks) !== Object.prototype &&
      Object.getPrototypeOf(marks) !== null)
  ) invalid("STUDY_REVIEW_MARKS_INVALID");
  const known = new Set(plan.tasks.map(taskKey));
  if (Object.keys(marks).length > plan.tasks.length) {
    invalid("STUDY_REVIEW_MARKS_INVALID");
  }
  for (const [key, value] of Object.entries(marks)) {
    if (!known.has(key) || !MARKS.has(value)) {
      invalid("STUDY_REVIEW_MARKS_INVALID");
    }
  }
  return marks;
}

function checkedMode(mode) {
  if (!MODES.has(mode)) invalid("STUDY_REVIEW_MODE_INVALID");
  return mode;
}

/** Ratings are local user choices; no score, retention or claimed comprehension. */
export function updateReviewMarks(source, marks, kind, id, rating) {
  const plan = normalizeStudySession(source);
  const current = checkedMarks(plan, marks);
  if (
    (kind !== "question" && kind !== "resource") ||
    typeof id !== "string" ||
    (rating !== null && !MARKS.has(rating))
  ) invalid("STUDY_REVIEW_RATING_INVALID");
  const key = kind + ":" + id;
  if (!plan.tasks.some((task) => taskKey(task) === key)) {
    invalid("STUDY_REVIEW_RATING_INVALID");
  }
  const next = Object.assign(Object.create(null), current);
  if (rating === null) delete next[key];
  else next[key] = rating;
  return next;
}

export function summarizeReviews(source, marks) {
  const plan = normalizeStudySession(source);
  const current = checkedMarks(plan, marks);
  const summary = {
    repeat: 0, reinforce: 0, confident: 0,
    pendingUnrated: 0, completedUnrated: 0,
    eligible: 0,
  };
  for (const task of plan.tasks) {
    const rating = current[taskKey(task)];
    if (rating === "repeat") summary.repeat += 1;
    else if (rating === "reinforce") summary.reinforce += 1;
    else if (rating === "confident") summary.confident += 1;
    else if (!task.done) summary.pendingUnrated += 1;
    else summary.completedUnrated += 1;
  }
  summary.eligible =
    summary.repeat + summary.reinforce + summary.pendingUnrated;
  return summary;
}

/**
 * Explicit repetition takes precedence; unfinished, unrated items follow;
 * reinforcement comes last. Never infer understanding from the timer or done.
 */
export function reviewCandidates(source, marks, mode = "all") {
  const plan = normalizeStudySession(source);
  const current = checkedMarks(plan, marks);
  checkedMode(mode);
  const ranked = [];
  for (let index = 0; index < plan.tasks.length; index += 1) {
    const task = plan.tasks[index];
    const rating = current[taskKey(task)];
    const category = rating === "repeat" ? "repeat"
      : rating === "reinforce" ? "reinforce"
        : rating === "confident" || task.done ? null : "pending";
    if (!category) continue;
    if (mode === "priority" && category === "reinforce") continue;
    if (mode === "reinforce" && category !== "reinforce") continue;
    const rank = category === "repeat" ? 0 : category === "pending" ? 1 : 2;
    ranked.push({ ...task, category, rank, order: index });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.order - b.order);
  return ranked.map(({ kind, id, minutes, done, category }) => ({
    kind, id, minutes, done, category,
  }));
}

/**
 * Portable Study Session v1 only. allowedKeys must come from a fresh
 * owner/subject authorization check at the calling boundary. No labels,
 * ratings, cached content, performance claims or grants leave the tab.
 */
export function buildReviewSession(source, marks, mode = "all", allowedKeys = null) {
  const plan = normalizeStudySession(source);
  const candidates = reviewCandidates(plan, marks, mode);
  let allowed = null;
  if (allowedKeys !== null) {
    if (!Array.isArray(allowedKeys) || allowedKeys.length > plan.tasks.length) {
      invalid("STUDY_REVIEW_ALLOWED_INVALID");
    }
    const known = new Set(candidates.map(taskKey));
    allowed = new Set();
    for (const key of allowedKeys) {
      if (typeof key !== "string" || !known.has(key) || allowed.has(key)) {
        invalid("STUDY_REVIEW_ALLOWED_INVALID");
      }
      allowed.add(key);
    }
  }
  const selected = candidates.filter((task) => allowed === null || allowed.has(taskKey(task)));
  if (!selected.length) return null;
  const title = ("Repaso: " + plan.title).slice(0, 100);
  return normalizeStudySession({
    ...plan,
    title,
    notes: "",
    startsAt: null,
    tasks: selected.map(({ kind, id, minutes }) => ({
      kind, id, minutes, done: false,
    })),
  });
}
