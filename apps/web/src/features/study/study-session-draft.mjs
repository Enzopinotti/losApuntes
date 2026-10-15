const saved = new Map();
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
export const STUDY_DRAFT_TTL_MS = 30 * 60 * 1000;
const MAX_DRAFTS = 5;

function safeScope(scope) {
  return typeof scope === "string" &&
    scope.startsWith("authenticated:") &&
    scope.length < 513;
}

function safeDraft(plan) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return false;
  if (
    typeof plan.subjectId !== "string" ||
    !UUID.test(plan.subjectId) ||
    plan.format !== "losapuntes.study-session" ||
    plan.version !== 1 ||
    typeof plan.title !== "string" ||
    plan.title.length > 100 ||
    typeof plan.notes !== "string" ||
    plan.notes.length > 500 ||
    (plan.startsAt !== null &&
      (typeof plan.startsAt !== "string" || plan.startsAt.length > 16)) ||
    !Array.isArray(plan.tasks) ||
    plan.tasks.length > 24
  ) return false;
  const keys = Object.keys(plan).sort().join(",");
  if (keys !== "format,notes,startsAt,subjectId,tasks,title,version") return false;
  return plan.tasks.every((task) =>
    task && typeof task === "object" && !Array.isArray(task) &&
    Object.keys(task).sort().join(",") === "done,id,kind,minutes" &&
    (task.kind === "question" || task.kind === "resource") &&
    typeof task.id === "string" && UUID.test(task.id) &&
    Number.isSafeInteger(task.minutes) && task.minutes >= 5 &&
    task.minutes <= 120 && typeof task.done === "boolean"
  );
}

/**
 * Stores user-authored draft fields and opaque IDs only. No fetched resource
 * titles or account tokens. Invalid/incomplete text edits remain legal drafts.
 * All data stays inside this JS module and disappears on document reload.
 */
export function rememberStudyDraft(scope, plan, now = Date.now()) {
  if (!safeScope(scope) || !safeDraft(plan) || !Number.isSafeInteger(now)) {
    return false;
  }
  const text = JSON.stringify(plan);
  if (text.length > 64000) return false;
  for (const [id, value] of saved) {
    if (value.expiresAt <= now) saved.delete(id);
  }
  saved.delete(scope);
  while (saved.size >= MAX_DRAFTS) saved.delete(saved.keys().next().value);
  saved.set(scope, {
    plan: JSON.parse(text),
    expiresAt: now + STUDY_DRAFT_TTL_MS,
  });
  return true;
}

export function recallStudyDraft(scope, subjectId, now = Date.now()) {
  if (!safeScope(scope) || typeof subjectId !== "string") return null;
  const record = saved.get(scope);
  if (!record) return null;
  if (record.expiresAt <= now) {
    saved.delete(scope);
    return null;
  }
  if (record.plan.subjectId !== subjectId.toLowerCase()) return null;
  return JSON.parse(JSON.stringify(record.plan));
}

export function forgetStudyDraft(scope) {
  if (!safeScope(scope)) return false;
  return saved.delete(scope);
}
