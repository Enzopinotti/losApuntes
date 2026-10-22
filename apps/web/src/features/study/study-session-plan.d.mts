export type StudySessionTask = {
  kind: "resource" | "question";
  id: string;
  minutes: number;
  done: boolean;
};
export type StudySession = {
  format: "losapuntes.study-session";
  version: 1;
  subjectId: string;
  title: string;
  notes: string;
  startsAt: string | null;
  tasks: StudySessionTask[];
};
export type StudySessionStats = {
  totalTasks: number;
  doneTasks: number;
  totalMinutes: number;
  doneMinutes: number;
  remainingMinutes: number;
};
export declare const STUDY_SESSION_FORMAT: "losapuntes.study-session";
export declare const STUDY_SESSION_VERSION: 1;
export declare const STUDY_SESSION_MAX_TASKS: 24;
export declare const STUDY_SESSION_MAX_MINUTES: 1200;
export declare function emptyStudySession(subjectId: string): StudySession;
export declare function normalizeStudySession(input: unknown): StudySession;
export declare function readStudySession(text: string): StudySession;
export declare function serializeStudySession(plan: StudySession): string;
export declare function studySessionStats(plan: StudySession): StudySessionStats;
export declare function buildStudySessionCalendar(
  plan: StudySession,
  labels: string[],
  uid: string,
  generatedAt: Date,
): string;
export declare function buildStudySessionMarkdown(
  plan: StudySession,
  labels: string[],
): string;
