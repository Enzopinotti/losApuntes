import type { StudySession } from "./study-session-plan.mjs";
import type { RecallOutcomes } from "./study-active-recall.mjs";

export type RecallAttemptSnapshot = {
  pass: number;
  total: number;
  understood: number;
  review: number;
  pending: number;
};

export declare const RECALL_REVIEW_DURATIONS: readonly number[];
export declare const RECALL_REVIEW_MAX_DAYS_AHEAD: number;
export declare const RECALL_ATTEMPT_HISTORY_LIMIT: number;

export declare function organizeRecallSession(
  plan: StudySession,
  startsAt: string | null,
  minutes: number,
  nowMs?: number,
): StudySession;

export declare function recordRecallAttempt(
  subjectId: string,
  history: readonly RecallAttemptSnapshot[],
  pass: number,
  ids: string[],
  outcomes: Readonly<RecallOutcomes>,
): RecallAttemptSnapshot[];
