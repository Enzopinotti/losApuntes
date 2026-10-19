import type { RecallOutcomes } from "./study-active-recall.mjs";

export type RecallOrderAction =
  | "earlier"
  | "later"
  | "review-first"
  | "pending-first";

export type OrganizedRecallQueue = {
  ids: string[];
  position: number;
};

export declare const RECALL_ORDER_ACTIONS: readonly RecallOrderAction[];

export declare function organizeRecallQueue(
  subjectId: string,
  ids: string[],
  position: number,
  outcomes: Readonly<RecallOutcomes>,
  action: RecallOrderAction,
): OrganizedRecallQueue | null;
