import {
  normalizeStudySession,
  STUDY_SESSION_MAX_TASKS,
  STUDY_SESSION_MAX_MINUTES,
} from "./study-session-plan.mjs";

export const STUDY_HANDOFF_KIND = "losapuntes.study.handoff";
export const STUDY_HANDOFF_VERSION = 1;
export const STUDY_HANDOFF_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING = 5;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const entries = new Map();

function reject(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function assertScope(scope) {
  if (
    typeof scope !== "string" ||
    scope.length < 5 ||
    scope.length > 512 ||
    !scope.startsWith("authenticated:")
  ) reject("STUDY_HANDOFF_SCOPE_INVALID");
}

function prune(now) {
  for (const [id, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(id);
  }
  while (entries.size >= MAX_PENDING) {
    entries.delete(entries.keys().next().value);
  }
}

/**
 * A handoff stays in this JavaScript module's memory, never in a URL,
 * browser history, localStorage or an API. The route state carries only
 * a one-time opaque nonce. Nothing is moved between users or auth sessions.
 */
export function createStudyHandoff(plan, scope, now = Date.now()) {
  assertScope(scope);
  if (!Number.isSafeInteger(now) || now < 0) {
    reject("STUDY_HANDOFF_TIME_INVALID");
  }
  const normalized = normalizeStudySession(plan);
  if (!normalized.tasks.length) reject("STUDY_HANDOFF_EMPTY");
  prune(now);
  const token = crypto.randomUUID();
  entries.set(token, {
    scope,
    plan: normalized,
    expiresAt: now + STUDY_HANDOFF_TTL_MS,
  });
  return {
    kind: STUDY_HANDOFF_KIND,
    version: STUDY_HANDOFF_VERSION,
    token,
  };
}

function readToken(state) {
  if (
    !state ||
    typeof state !== "object" ||
    Array.isArray(state) ||
    Object.keys(state).sort().join(",") !== "kind,token,version" ||
    state.kind !== STUDY_HANDOFF_KIND ||
    state.version !== STUDY_HANDOFF_VERSION ||
    typeof state.token !== "string" ||
    !UUID.test(state.token)
  ) return null;
  return state.token;
}

export function isStudyHandoffRouteState(state) {
  return readToken(state) !== null;
}

/** Query does not consume; entries are consumed only after API verification. */
export function inspectStudyHandoff(
  state,
  scope,
  subjectId,
  now = Date.now(),
) {
  const token = readToken(state);
  if (!token || typeof scope !== "string" || typeof subjectId !== "string") {
    return null;
  }
  const entry = entries.get(token);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    entries.delete(token);
    return null;
  }
  if (entry.scope !== scope || entry.plan.subjectId !== subjectId.toLowerCase()) {
    return null;
  }
  return normalizeStudySession(entry.plan);
}

/** Cannot invalidate or consume another user/session's handoff. */
export function finishStudyHandoff(state, scope) {
  const token = readToken(state);
  if (!token || typeof scope !== "string") return false;
  const entry = entries.get(token);
  if (!entry || entry.scope !== scope) return false;
  entries.delete(token);
  return true;
}

/**
 * Existing plan wins for shared keys, preserving its progress and durations.
 * The new plan contributes only genuinely new questions. Atomic rejection
 * leaves both inputs unchanged if there is no room for the new tasks.
 */
export function mergeStudySessionHandoff(existing, incoming) {
  const current = normalizeStudySession(existing);
  const next = normalizeStudySession(incoming);
  if (current.subjectId !== next.subjectId) {
    reject("STUDY_HANDOFF_SUBJECT_MISMATCH");
  }
  const known = new Set(current.tasks.map((task) => task.kind + ":" + task.id));
  const added = next.tasks.filter((task) => !known.has(task.kind + ":" + task.id));
  const result = {
    ...current,
    tasks: [...current.tasks, ...added],
  };
  if (result.tasks.length > STUDY_SESSION_MAX_TASKS) {
    reject("STUDY_HANDOFF_TASK_LIMIT");
  }
  if (
    result.tasks.reduce((sum, task) => sum + task.minutes, 0) >
    STUDY_SESSION_MAX_MINUTES
  ) reject("STUDY_HANDOFF_TIME_LIMIT");
  return { plan: normalizeStudySession(result), added: added.length };
}
