export type FocusMode = "study" | "rest";
export type FocusPhase = "idle" | "running" | "paused" | "done";
export type FocusClock = {
  mode: FocusMode;
  phase: FocusPhase;
  remainingMs: number;
  deadlineMs: number | null;
};
export const FOCUS_DURATIONS_MS: Readonly<Record<FocusMode, number>>;
export function createFocusClock(mode?: FocusMode): FocusClock;
export function advanceFocusClock(clock: FocusClock, now: number): FocusClock;
export function startFocusClock(clock: FocusClock, now: number): FocusClock;
export function pauseFocusClock(clock: FocusClock, now: number): FocusClock;
export function resetFocusClock(clock: FocusClock): FocusClock;
export function selectFocusMode(mode: FocusMode): FocusClock;
export function formatFocusRemaining(remainingMs: number): string;
