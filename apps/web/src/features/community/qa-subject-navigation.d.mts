export function questionSubjectIdFromSearchParams(
  params: URLSearchParams,
): string | null | undefined;

export function questionListHref(
  subjectId: string | null | undefined,
): string | null;

export function questionDetailSearchParams(
  params: URLSearchParams,
  questionId: string,
): URLSearchParams;
