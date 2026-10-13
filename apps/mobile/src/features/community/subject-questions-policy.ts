/**
 * A route parameter never grants academic participation or read authority.
 * Its sole purpose is to request the already-authorized questions feed.
 */
const SUBJECT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function subjectQuestionsRouteId(
  param: string | string[] | undefined,
): string | null {
  if (typeof param !== "string" || !SUBJECT_UUID.test(param)) return null;
  return param.toLocaleLowerCase("en-US");
}

export function canComposeForSubject(
  requestedSubjectId: string | null,
  gate: string,
  scope: { kind: string; subjectId?: string },
): boolean {
  return (
    !!requestedSubjectId &&
    gate === "ready" &&
    scope.kind === "subject" &&
    scope.subjectId === requestedSubjectId
  );
}
