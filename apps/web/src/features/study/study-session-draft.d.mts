import type { StudySession } from "./study-session-plan.mjs";
export declare const STUDY_DRAFT_TTL_MS: number;
export declare function rememberStudyDraft(
  scope: string,
  plan: StudySession,
  now?: number,
): boolean;
export declare function recallStudyDraft(
  scope: string,
  subjectId: string,
  now?: number,
): StudySession | null;
export declare function forgetStudyDraft(scope: string): boolean;
