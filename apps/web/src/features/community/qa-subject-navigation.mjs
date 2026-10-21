// The public Q&A list accepts the same canonical Subject UUID v4 as its API.
// Missing filter is different from malformed filter: never broaden invalid URLs.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function questionSubjectIdFromSearchParams(params) {
  if (!params.has("subjectId")) return null;
  const ids = params.getAll("subjectId");
  if (ids.length !== 1 || !UUID_V4.test(ids[0])) return undefined;
  return ids[0].toLowerCase();
}

export function questionListHref(subjectId) {
  if (subjectId === null) return "/questions";
  if (typeof subjectId !== "string" || !UUID_V4.test(subjectId)) return null;
  return `/questions?subjectId=${encodeURIComponent(subjectId.toLowerCase())}`;
}

// A question can be opened without discarding the current subject filter.
// No new ownership or access authority is created by this client-side URL.
export function questionDetailSearchParams(params, questionId) {
  const next = new URLSearchParams(params);
  next.set("id", questionId);
  return next;
}
