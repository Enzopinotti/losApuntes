const allowedScopes = new Set(["all", "resources", "subjects", "people"]);
const MAX_QUERY_LENGTH = 120;

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
  return {
    q: query,
    scope: allowedScopes.has(requestedScope) ? requestedScope : "all",
  };
}

/** URLs contain only the explicitly submitted query and public search scope. */
export function searchSelectionHref(selection) {
  const query = validQuery(selection?.q);
  if (!query) return null;
  const scope = allowedScopes.has(selection.scope) ? selection.scope : "all";
  const params = new URLSearchParams({ q: query });
  if (scope !== "all") params.set("scope", scope);
  return `/search?${params.toString()}`;
}

/** A scoped identity for distinguishing results from previous sessions. */
export function searchSelectionKey(selection) {
  return selection ? JSON.stringify([selection.q, selection.scope]) : null;
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
  if (typeof candidate !== "string" || !candidate.startsWith("/search?")) {
    return null;
  }

  const selection = searchSelectionFromSearchParams(
    new URLSearchParams(candidate.slice("/search?".length)),
  );
  const canonical = selection && searchSelectionHref(selection);
  return candidate === canonical ? canonical : null;
}
