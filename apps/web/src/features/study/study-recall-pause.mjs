import { normalizeRecallQueue, retryRecallQueue } from "./study-active-recall.mjs";
import {
  RECALL_ATTEMPT_HISTORY_LIMIT,
  RECALL_REVIEW_DURATIONS,
} from "./study-recall-planning.mjs";

export const RECALL_CHECKPOINT_TTL_MS = 10 * 60 * 1000;
export const RECALL_CHECKPOINT_MAX_SCOPES = 5;
const MAX_TEXT_BYTES = 8192;
const memory = new Map();

function validPlain(value) {
  return value !== null && typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null);
}

function exactKeys(value, keys) {
  return validPlain(value) &&
    Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function invalid() {
  const error = new Error("RECALL_CHECKPOINT_INVALID");
  error.code = "RECALL_CHECKPOINT_INVALID";
  throw error;
}

function validScope(scope) {
  return typeof scope === "string" &&
    scope.startsWith("authenticated:") &&
    scope.length <= 512 &&
    scope.length >= 20;
}

function validClock(now) {
  return Number.isSafeInteger(now) && now >= 0 &&
    now <= Number.MAX_SAFE_INTEGER - RECALL_CHECKPOINT_TTL_MS;
}

function normalizeCheckpoint(subjectId, source) {
  if (!exactKeys(source, [
    "ids", "position", "pass", "outcomes", "history", "startsAt", "minutes",
  ])) invalid();
  const ids = normalizeRecallQueue(subjectId, source.ids);
  if (!Number.isSafeInteger(source.position) ||
    source.position < 0 || source.position >= ids.length ||
    !Number.isSafeInteger(source.pass) ||
    source.pass < 1 || source.pass > 10000) invalid();
  // Only explicit user ratings for question IDs in this exact round survive;
  // no server content, titles, notes or reveal flags can enter this format.
  retryRecallQueue(subjectId, ids, source.outcomes);
  if (!Array.isArray(source.history) ||
    source.history.length > RECALL_ATTEMPT_HISTORY_LIMIT) invalid();
  let previous = 0;
  const history = source.history.map((entry) => {
    if (!exactKeys(entry, [
      "pass", "total", "understood", "review", "pending",
    ]) ||
      ![entry.pass, entry.total, entry.understood, entry.review, entry.pending]
        .every((n) => Number.isSafeInteger(n) && n >= 0) ||
      entry.pass <= previous || entry.pass >= source.pass ||
      entry.total < 1 || entry.total > 10 ||
      entry.understood + entry.review + entry.pending !== entry.total) invalid();
    previous = entry.pass;
    return {
      pass: entry.pass, total: entry.total,
      understood: entry.understood, review: entry.review,
      pending: entry.pending,
    };
  });
  if (source.startsAt !== "" &&
    (typeof source.startsAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(source.startsAt))) invalid();
  if (!RECALL_REVIEW_DURATIONS.includes(source.minutes)) invalid();
  return {
    ids,
    position: source.position,
    pass: source.pass,
    outcomes: Object.fromEntries(
      Object.entries(source.outcomes).map(([id, mark]) => [id, mark]),
    ),
    history,
    startsAt: source.startsAt,
    minutes: source.minutes,
  };
}

function prune(now) {
  for (const [scope, saved] of memory) {
    if (saved.expiresAt <= now) memory.delete(scope);
  }
}

/** Pause is explicit and memory-only; never serialize reflections or answers. */
export function pauseRecallRound(scope, subjectId, data, now = Date.now()) {
  if (!validScope(scope) || !validClock(now)) invalid();
  const checkpoint = normalizeCheckpoint(subjectId, data);
  const text = JSON.stringify(checkpoint);
  if (text.length > MAX_TEXT_BYTES) invalid();
  prune(now);
  memory.delete(scope);
  while (memory.size >= RECALL_CHECKPOINT_MAX_SCOPES) {
    memory.delete(memory.keys().next().value);
  }
  memory.set(scope, {
    subjectId: subjectId.toLowerCase(),
    text,
    expiresAt: now + RECALL_CHECKPOINT_TTL_MS,
  });
  return true;
}

function read(scope, subjectId, now) {
  if (!validScope(scope) || typeof subjectId !== "string" ||
    !validClock(now)) return null;
  prune(now);
  const saved = memory.get(scope);
  if (!saved || saved.subjectId !== subjectId.toLowerCase()) return null;
  try {
    const checkpoint = normalizeCheckpoint(subjectId, JSON.parse(saved.text));
    return { checkpoint, expiresAt: saved.expiresAt };
  } catch {
    memory.delete(scope);
    return null;
  }
}

/** Inspection does not consume the pause; no implicit auto-resume. */
export function inspectRecallPause(scope, subjectId, now = Date.now()) {
  return read(scope, subjectId, now);
}

/** Resume consumes exactly once, even when called by rapid repeated clicks. */
export function takeRecallPause(scope, subjectId, now = Date.now()) {
  const record = read(scope, subjectId, now);
  if (!record) return null;
  memory.delete(scope);
  return record.checkpoint;
}

/** Forget only a pause belonging to this exact auth and subject scope. */
export function forgetRecallPause(scope, subjectId, now = Date.now()) {
  if (!read(scope, subjectId, now)) return false;
  return memory.delete(scope);
}
