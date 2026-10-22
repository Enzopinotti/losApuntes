import type { StudySessionTask } from "./study-session-plan.mjs";

export type MaterialSearchKind = StudySessionTask["kind"];
export type MaterialQuestionState = "" | "open" | "closed";
export type MaterialSearchFilter = {
  kind: MaterialSearchKind;
  q: string;
  status: MaterialQuestionState;
};

export const STUDY_MATERIAL_SEARCH_MAX_LENGTH: 120;
export const STUDY_MATERIAL_SEARCH_DEFAULTS: Readonly<{
  kind: "resource";
  q: "";
  status: "";
}>;

export function normalizeStudyMaterialSearchFilter(
  value: unknown,
): MaterialSearchFilter | null;

export function studyMaterialSearchKey(
  scope: string,
  filter: MaterialSearchFilter,
): string | null;

export function materialTaskMinutes(
  kind: unknown,
): 25 | 20 | null;

export function mayAddStudyMaterial(
  kind: MaterialSearchKind,
  id: string,
  existingKeys: Set<string>,
  count: number,
  minutesRemaining: number,
  maxTasks: number,
): boolean;
