import type { StudySession } from "./study-session-plan.mjs";

export type RecallOutcome = "understood" | "review";
export type RecallOutcomes = Record<string, RecallOutcome>;
export type RecallSummary = {
  total: number;
  completed: number;
  understood: number;
  review: number;
  pending: number;
};
export declare const ACTIVE_RECALL_MAX_QUESTIONS: 10;
export declare function normalizeRecallQueue(
  subjectId: string,
  ids: string[],
): string[];
export declare function retryRecallQueue(
  subjectId: string,
  ids: string[],
  outcomes: Readonly<RecallOutcomes>,
): string[] | null;
export declare function nextRecallOutcomes(
  queue: string[],
  previous: Readonly<Record<string, RecallOutcome>>,
  questionId: string,
  outcome: RecallOutcome,
): RecallOutcomes;
export declare function recallSummary(
  queue: string[],
  outcomes: Readonly<RecallOutcomes>,
): RecallSummary;
export declare function recallToStudySession(
  subjectId: string,
  queue: string[],
  outcomes: Readonly<RecallOutcomes>,
): StudySession | null;
