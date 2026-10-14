const allowedScopes = new Set(["all", "resources", "subjects", "people"]);
const MAX_QUERY_LENGTH = 120;
// The search endpoint accepts only UUID v4 subject identifiers.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function validSubjectId(value) {
  if (typeof value !== "string" || !UUID_V4.test(value)) return null;
  return value.toLowerCase();
}

function canFilterResources(scope) {
  return scope === "all" || scope === "resources";
}

function validQuery(query) {
  if (typeof query !== "string") return null;
  const trimmed = query.trim();
  if (
    trimmed.length < 2 ||
    trimmed.length > MAX_QUERY_LENGTH ||
    /[\u0000-\u001f\u007f]/u.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

/**
 * Read a submitted (never draft) public search. Invalid links do not fire
 * requests; unknown scopes fail back to public "all" results.
 */
export function searchSelectionFromSearchParams(params) {
  const query = validQuery(params.get("q"));
  if (!query) return null;

  const requestedScope = params.get("scope");
  const scope = allowedScopes.has(requestedScope) ? requestedScope : "all";
  const requestedSubjectId = params.get("subjectId");
  const subjectId = requestedSubjectId
    ? validSubjectId(requestedSubjectId)
    : null;
  // Invalid, duplicate or non-resource subject filters must never silently
  // broaden a search that the sender intended to scope.
  if (
    (params.has("subjectId") &&
      (params.getAll("subjectId").length !== 1 || !subjectId)) ||
    (subjectId && !canFilterResources(scope))
  ) {
    return null;
  }

  return { q: query, scope, ...(subjectId ? { subjectId } : {}) };
}

/** URLs contain only the explicitly submitted query and public search scope. */
export function searchSelectionHref(selection) {
  const query = validQuery(selection?.q);
  if (!query) return null;
  const scope = allowedScopes.has(selection.scope) ? selection.scope : "all";
  const subjectId =
    selection.subjectId == null || selection.subjectId === ""
      ? null
      : validSubjectId(selection.subjectId);
  if (
    (selection.subjectId && !subjectId) ||
    (subjectId && !canFilterResources(scope))
  ) {
    return null;
  }

  const params = new URLSearchParams({ q: query });
  if (scope !== "all") params.set("scope", scope);
  if (subjectId) params.set("subjectId", subjectId);
  return `/search?${params.toString()}`;
}

/** A scoped identity for distinguishing results from previous sessions. */
export function searchSelectionKey(selection) {
  return selection
    ? JSON.stringify([selection.q, selection.scope, selection.subjectId ?? null])
    : null;
}

/**
 * Only a canonical internal Search URL is accepted as a return destination.
 * Ignore arbitrary navigation state instead of treating it as a redirect.
 */
export function searchReturnHref(locationState) {
  if (typeof locationState !== "object" || locationState === null) {
    return null;
  }

  const candidate = locationState.searchReturnTo;
  if (candidate === "/search") return candidate;
  if (typeof candidate !== "string" || !candidate.startsWith("/search?")) {
    return null;
  }

  const selection = searchSelectionFromSearchParams(
    new URLSearchParams(candidate.slice("/search?".length)),
  );
  const canonical = selection && searchSelectionHref(selection);
  return candidate === canonical ? canonical : null;
}
