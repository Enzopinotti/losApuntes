import type { StudySession } from "./study-session-plan.mjs";
export type ReviewMark = "repeat" | "reinforce" | "confident";
export type ReviewMode = "all" | "priority" | "reinforce";
export type ReviewMarks = Record<string, ReviewMark>;
export type ReviewCandidate = {
  kind: "resource" | "question";
  id: string;
  minutes: number;
  done: boolean;
  category: "repeat" | "reinforce" | "pending";
};
export declare function updateReviewMarks(
  plan: StudySession,
  marks: ReviewMarks,
  kind: "resource" | "question",
  id: string,
  rating: ReviewMark | null,
): ReviewMarks;
export declare function summarizeReviews(
  plan: StudySession, marks: ReviewMarks,
): {
  repeat: number;
  reinforce: number;
  confident: number;
  pendingUnrated: number;
  completedUnrated: number;
  eligible: number;
};
export declare function reviewCandidates(
  plan: StudySession, marks: ReviewMarks, mode?: ReviewMode,
): ReviewCandidate[];
export declare function buildReviewSession(
  plan: StudySession, marks: ReviewMarks,
  mode?: ReviewMode, allowedKeys?: string[] | null,
): StudySession | null;
