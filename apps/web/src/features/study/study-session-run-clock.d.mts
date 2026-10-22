import type { StudySession } from "./study-session-plan.mjs";
export type TaskClock = { remainingMs: number; startedAt: number | null };
export declare function createTaskClock(minutes: number): TaskClock;
export declare function remainingTaskClock(clock: TaskClock, now: number): number;
export declare function pauseTaskClock(clock: TaskClock, now: number): TaskClock;
export declare function startTaskClock(clock: TaskClock, now: number): TaskClock;
export declare function updateRunTask(
  plan: StudySession,
  kind: "resource" | "question",
  id: string,
  done: boolean,
): StudySession;
export declare function runSummary(plan: StudySession): {
  total: number;
  done: number;
  remaining: number;
  totalMinutes: number;
  doneMinutes: number;
};
