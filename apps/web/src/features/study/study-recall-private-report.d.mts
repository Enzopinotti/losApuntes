import type { RecallAttemptSnapshot } from "./study-recall-planning.mjs";
export type PrivateRecallReportInput = {
  history: readonly RecallAttemptSnapshot[];
  current: RecallAttemptSnapshot;
  minutes: number;
};
export declare const RECALL_REPORT_FORMAT: "losapuntes.private-recall-report";
export declare const RECALL_REPORT_VERSION: 1;
export declare function buildPrivateRecallReport(
  input: PrivateRecallReportInput,
): string;
