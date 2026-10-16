import type { StudySession, StudySessionTask } from "./study-session-plan.mjs";

export declare function verifyStudyTaskLabels(
  source: StudySession,
  verifyTask: (task: StudySessionTask) => Promise<string | null>,
  isCurrent: () => boolean,
): Promise<Record<string, string | null> | null>;
