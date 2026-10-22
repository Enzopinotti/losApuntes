export type FocusMode = "study" | "rest";
export type FocusPhase = "idle" | "running" | "paused" | "done";

export type FocusClock = Readonly<{
  mode: FocusMode;
  phase: FocusPhase;
  remainingMs: number;
  deadlineMs: number | null;
}>;

export const FOCUS_DURATIONS_MS = Object.freeze({
  study: 25 * 60 * 1000,
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

export function createFocusClock(mode: FocusMode = "study"): FocusClock {
  const selected = checkMode(mode);
  return {
    mode: selected,
    phase: "idle",
    remainingMs: FOCUS_DURATIONS_MS[selected],
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
  return createFocusClock(clock.mode);
}

export function selectFocusMode(mode: FocusMode): FocusClock {
  return createFocusClock(mode);
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
