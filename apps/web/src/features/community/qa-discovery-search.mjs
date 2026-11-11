import { questionSubjectIdFromSearchParams } from "./qa-subject-navigation.mjs";

// The public API accepts q only at length 2..120 and open/closed states.
// Malformed/duplicated URL filters must not silently broaden the listing.
export function questionDiscoveryFiltersFromParams(params) {
  const queries = params.getAll("q");
  const states = params.getAll("status");
  if (queries.length > 1 || states.length > 1) return null;
  const q = queries.length ? queries[0].trim() : "";
  const status = states.length ? states[0] : "";

  if (
    (queries.length && (q.length < 2 || q.length > 120)) ||
    (states.length && status !== "open" && status !== "closed")
  ) {
    return null;
  }
  return { q, status };
}

// Submitting a search closes the previous detail but retains the canonical
// subject link and unrelated router state. It never writes an invalid query.
export function questionDiscoverySearchParams(params, query, status) {
  const q = typeof query === "string" ? query.trim() : "";
  if (
    (q.length > 0 && (q.length < 2 || q.length > 120)) ||
    (status !== "" && status !== "open" && status !== "closed")
  ) {
    return null;
  }
  const next = new URLSearchParams(params);
  next.delete("id");
  next.delete("q");
  next.delete("status");
  if (q) next.set("q", q);
  if (status) next.set("status", status);
  return next;
}

// Explicitly clearing search text/state never drops the academic subject.
export function questionDiscoveryClearParams(params) {
  const next = new URLSearchParams(params);
  next.delete("id");
  next.delete("q");
  next.delete("status");
  return next;
}

// A shareable discovery URL contains only validated PUBLIC filters. In
// particular it never includes question detail, auth, cursor or location state.
export function questionDiscoveryListHref(params) {
  const filters = questionDiscoveryFiltersFromParams(params);
  const subjectId = questionSubjectIdFromSearchParams(params);
  if (filters === null || subjectId === undefined) return null;
  const shared = new URLSearchParams();
  if (subjectId) shared.set("subjectId", subjectId);
  if (filters.q) shared.set("q", filters.q);
  if (filters.status) shared.set("status", filters.status);
  const search = shared.toString();
  return search ? `/questions?${search}` : "/questions";
}
