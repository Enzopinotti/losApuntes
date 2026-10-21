export const STUDY_KIT_RESOURCE_QUERY_MAX: 120;

export function normalizeStudyKitResourceQuery(value: unknown): string | null;

export function studyKitResourceSearchScope(
  authScope: string,
  subjectId: string,
  q: string,
): string | null;
