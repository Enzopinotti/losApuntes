export type RecallReviewImport = {
  ids: string[];
  startsAt: string;
  minutes: number;
};
export declare const ACTIVE_RECALL_PLAN_FILE_LIMIT: number;
export declare function importRecallReviewPlan(
  subjectId: string,
  text: string,
): RecallReviewImport;
