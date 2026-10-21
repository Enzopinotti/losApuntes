export const STUDY_KIT_RESOURCE_QUERY_MAX = 120;

/** ResourceSearchDto permits absent q or 2-120 non-control characters. */
export function normalizeStudyKitResourceQuery(value) {
  if (typeof value !== "string") return null;
  const q = value.trim();
  if (q.length < 2 || q.length > STUDY_KIT_RESOURCE_QUERY_MAX) return null;
  for (const ch of q) {
    const codePoint = ch.charCodeAt(0);
    if (codePoint < 32 || codePoint === 127) return null;
  }
  return q;
}

export function studyKitResourceSearchScope(authScope, subjectId, q) {
  const normalized = normalizeStudyKitResourceQuery(q);
  if (
    typeof authScope !== "string" ||
    authScope.length === 0 ||
    typeof subjectId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(subjectId) ||
    !normalized
  ) {
    return null;
  }
  return JSON.stringify([authScope, subjectId.toLowerCase(), normalized]);
}
