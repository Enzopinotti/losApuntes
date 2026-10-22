const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/**
 * Subject-only route state. Unknown, repeated, malformed or arbitrary values
 * never become an API filter or silently broaden to a different Subject.
 */
export function studySubjectSelectionFromParams(params) {
  const values = params.getAll("subjectId");
  if (values.length === 0) return { kind: "unselected" };
  if (values.length !== 1 || !UUID_V4.test(values[0])) {
    return { kind: "invalid" };
  }
  return { kind: "selected", subjectId: values[0].toLowerCase() };
}

export function studySubjectHref(subjectId) {
  if (typeof subjectId !== "string" || !UUID_V4.test(subjectId)) {
    return null;
  }
  return `/study?subjectId=${encodeURIComponent(subjectId.toLowerCase())}`;
}

/**
 * Contextual Discovery is already derived from server-validated current
 * SubjectParticipations. This is a navigation projection, not an enrollment
 * or permissions grant. Resolve only within the returned subjects.
 */
export function resolveStudySubject(selection, buckets) {
  if (selection.kind === "invalid") return { kind: "invalid" };
  if (!Array.isArray(buckets) || buckets.length === 0) {
    return { kind: "no-context" };
  }
  const requested =
    selection.kind === "selected" ? selection.subjectId : buckets[0]?.subject?.id;
  if (typeof requested !== "string" || !UUID_V4.test(requested)) {
    return { kind: "unavailable" };
  }
  const bucket = buckets.find((candidate) => candidate?.subject?.id === requested);
  if (!bucket) return { kind: "unavailable" };
  return {
    kind: "ready",
    subject: { id: bucket.subject.id, name: bucket.subject.name },
  };
}
