import type { RecallOutcomes } from "./study-active-recall.mjs";

export type RecallGoalKind = "classified" | "explained";
export type RecallGoalProgress = {
  kind: RecallGoalKind;
  target: number;
  achieved: number;
  remaining: number;
  met: boolean;
  total: number;
};

export declare const RECALL_GOAL_KINDS: readonly RecallGoalKind[];

export declare function measureRecallGoal(
  subjectId: string,
  ids: string[],
  outcomes: Readonly<RecallOutcomes>,
  kind: RecallGoalKind,
  target: number,
): RecallGoalProgress;
