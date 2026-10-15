import type { StudySession } from "./study-session-plan.mjs";
export type StudyHandoffRouteState = {
  kind: "losapuntes.study.handoff";
  version: 1;
  token: string;
};
export declare const STUDY_HANDOFF_KIND: "losapuntes.study.handoff";
export declare const STUDY_HANDOFF_VERSION: 1;
export declare const STUDY_HANDOFF_TTL_MS: number;
export declare function createStudyHandoff(
  plan: StudySession,
  scope: string,
  now?: number,
): StudyHandoffRouteState;
export declare function isStudyHandoffRouteState(state: unknown): state is StudyHandoffRouteState;
export declare function inspectStudyHandoff(
  state: unknown,
  scope: string,
  subjectId: string,
  now?: number,
): StudySession | null;
export declare function finishStudyHandoff(state: unknown, scope: string): boolean;
export declare function mergeStudySessionHandoff(
  existing: StudySession,
  incoming: StudySession,
): { plan: StudySession; added: number };
