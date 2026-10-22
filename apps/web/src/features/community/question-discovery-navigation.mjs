// Canonical, public Q&A discovery links. No account or private academic
// context is encoded: the API remains the authority for resource visibility.
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const EMPTY_QUESTION_DISCOVERY = Object.freeze({
  q: "",
  status: "",
  subjectId: "",
});

function validSelection(value) {
  if (!value || typeof value !== "object") return null;
  const rawQuery = value.q ?? "";
  const rawStatus = value.status ?? "";
  const rawSubjectId = value.subjectId ?? "";

  if (
    typeof rawQuery !== "string" ||
    typeof rawStatus !== "string" ||
    typeof rawSubjectId !== "string"
  ) return null;

  const q = rawQuery.trim();
  if (
    (q && (q.length < 2 || q.length > 120)) ||
    /[\u0000-\u001f\u007f]/u.test(q)
  ) return null;
  if (!["", "open", "closed"].includes(rawStatus)) return null;
  if (rawSubjectId && !UUID_V4.test(rawSubjectId)) return null;
  return {
    q,
    status: rawStatus,
    subjectId: rawSubjectId.toLowerCase(),
  };
}

/** Malformed, duplicated or incompatible filters never become broad results. */
export function questionDiscoverySelectionFromParams(params) {
  for (const name of ["q", "status", "subjectId"]) {
    if (params.getAll(name).length > 1) return null;
  }
  if (params.has("q") && !params.get("q")?.trim()) return null;
  if (params.has("status") && !params.get("status")) return null;
  if (params.has("subjectId") && !params.get("subjectId")) return null;
  return validSelection({
    q: params.get("q") ?? "",
    status: params.get("status") ?? "",
    subjectId: params.get("subjectId") ?? "",
  });
}

export function questionDiscoveryHref(selection, questionId) {
  const checked = validSelection(selection);
  if (!checked) return null;
  if (
    questionId !== undefined &&
    (typeof questionId !== "string" || !UUID_V4.test(questionId))
  ) return null;

  const params = new URLSearchParams();
  if (checked.q) params.set("q", checked.q);
  if (checked.status) params.set("status", checked.status);
  if (checked.subjectId) params.set("subjectId", checked.subjectId);
  if (questionId) params.set("id", questionId.toLowerCase());
  const query = params.toString();
  return query ? `/questions?${query}` : "/questions";
}

export function questionDiscoverySelectionKey(selection) {
  const checked = validSelection(selection);
  return checked
    ? JSON.stringify([checked.q, checked.status, checked.subjectId])
    : null;
}
