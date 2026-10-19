import type { RecallOutcomes } from "./study-active-recall.mjs";

export type RecallFocusCategory = "pending" | "review";
export declare function nextRecallFocus(
  subjectId: string,
  ids: string[],
  position: number,
  outcomes: Readonly<RecallOutcomes>,
  category: RecallFocusCategory,
): number | null;
