export type FocusMode = "study" | "rest";
export type FocusPhase = "idle" | "running" | "paused" | "done";

export type FocusClock = Readonly<{
  mode: FocusMode;
  phase: FocusPhase;
  durationMs: number;
  remainingMs: number;
  deadlineMs: number | null;
}>;

export const DEFAULT_STUDY_FOCUS_MINUTES = 25;
export const MIN_STUDY_FOCUS_MINUTES = 5;
export const MAX_STUDY_FOCUS_MINUTES = 120;
const MINUTE_MS = 60 * 1000;

export const FOCUS_DURATIONS_MS = Object.freeze({
  study: DEFAULT_STUDY_FOCUS_MINUTES * MINUTE_MS,
  rest: 5 * 60 * 1000,
});

function checkMode(mode: FocusMode): FocusMode {
  if (mode !== "study" && mode !== "rest") {
    throw new TypeError("Unknown focus-clock mode");
  }
  return mode;
}

function checkNow(now: number): number {
  if (!Number.isFinite(now) || now < 0) {
    throw new TypeError("Clock timestamp must be finite and non-negative");
  }
  return now;
}

function checkStudyMinutes(minutes: number): number {
  if (
    !Number.isSafeInteger(minutes) ||
    minutes < MIN_STUDY_FOCUS_MINUTES ||
    minutes > MAX_STUDY_FOCUS_MINUTES ||
    minutes % MIN_STUDY_FOCUS_MINUTES !== 0
  ) {
    throw new TypeError(
      "Study focus duration must be 5–120 minutes in steps of 5",
    );
  }
  return minutes;
}

export function studyFocusMinutesFromParam(
  raw: string | string[] | undefined,
): number | null {
  const value = Array.isArray(raw)
    ? raw.length === 1
      ? raw[0]
      : undefined
    : raw;
  if (typeof value !== "string" || !/^\d+$/u.test(value)) return null;
  const minutes = Number(value);
  if (
    !Number.isSafeInteger(minutes) ||
    minutes < MIN_STUDY_FOCUS_MINUTES ||
    minutes > MAX_STUDY_FOCUS_MINUTES ||
    minutes % MIN_STUDY_FOCUS_MINUTES !== 0
  ) {
    return null;
  }
  return minutes;
}

export function createFocusClock(
  mode: FocusMode = "study",
  studyMinutes = DEFAULT_STUDY_FOCUS_MINUTES,
): FocusClock {
  const selected = checkMode(mode);
  const durationMs =
    selected === "study"
      ? checkStudyMinutes(studyMinutes) * MINUTE_MS
      : FOCUS_DURATIONS_MS.rest;
  return {
    mode: selected,
    phase: "idle",
    durationMs,
    remainingMs: durationMs,
    deadlineMs: null,
  };
}

export function advanceFocusClock(clock: FocusClock, now: number): FocusClock {
  checkNow(now);
  if (clock.phase !== "running" || clock.deadlineMs === null) return clock;
  const remainingMs = Math.min(
    clock.remainingMs,
    Math.max(0, clock.deadlineMs - now),
  );
  if (remainingMs === 0) {
    return { ...clock, remainingMs: 0, deadlineMs: null, phase: "done" };
  }
  if (remainingMs === clock.remainingMs) return clock;
  return { ...clock, remainingMs };
}

export function startFocusClock(clock: FocusClock, now: number): FocusClock {
  checkNow(now);
  const current = advanceFocusClock(clock, now);
  if (current.phase === "running" || current.phase === "done") return current;
  return {
    ...current,
    phase: "running",
    deadlineMs: now + current.remainingMs,
  };
}

export function pauseFocusClock(clock: FocusClock, now: number): FocusClock {
  const current = advanceFocusClock(clock, now);
  if (current.phase !== "running") return current;
  return { ...current, phase: "paused", deadlineMs: null };
}

export function resetFocusClock(clock: FocusClock): FocusClock {
  return createFocusClock(
    clock.mode,
    clock.mode === "study"
      ? clock.durationMs / MINUTE_MS
      : DEFAULT_STUDY_FOCUS_MINUTES,
  );
}

export function selectFocusMode(
  mode: FocusMode,
  studyMinutes = DEFAULT_STUDY_FOCUS_MINUTES,
): FocusClock {
  return createFocusClock(mode, studyMinutes);
}

export function formatFocusRemaining(remainingMs: number): string {
  if (!Number.isFinite(remainingMs) || remainingMs < 0) {
    throw new TypeError("Invalid remaining time");
  }
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
