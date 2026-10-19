import type { RecallOutcomes } from "./study-active-recall.mjs";

export type RecallClosure = {
  phase: "classify" | "review" | "ready";
  total: number;
  pending: number;
  review: number;
  understood: number;
  firstPending: number | null;
  firstReview: number | null;
  estimatedReviewMinutes: number;
};

export declare function planRecallClosure(
  subjectId: string,
  ids: string[],
  outcomes: Readonly<RecallOutcomes>,
  minutes: number,
): RecallClosure;
