import type { RecallOutcomes } from "./study-active-recall.mjs";
import type { RecallAttemptSnapshot } from "./study-recall-planning.mjs";

export type RecallPauseData = {
  ids: string[];
  position: number;
  pass: number;
  outcomes: RecallOutcomes;
  history: RecallAttemptSnapshot[];
  startsAt: string;
  minutes: number;
};
export declare const RECALL_CHECKPOINT_TTL_MS: number;
export declare const RECALL_CHECKPOINT_MAX_SCOPES: number;
export declare function pauseRecallRound(
  scope: string,
  subjectId: string,
  data: RecallPauseData,
  now?: number,
): boolean;
export declare function inspectRecallPause(
  scope: string,
  subjectId: string,
  now?: number,
): { checkpoint: RecallPauseData; expiresAt: number } | null;
export declare function takeRecallPause(
  scope: string,
  subjectId: string,
  now?: number,
): RecallPauseData | null;
export declare function forgetRecallPause(
  scope: string,
  subjectId: string,
  now?: number,
): boolean;
