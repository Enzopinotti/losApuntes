import type { SearchScope } from "@losapuntes/contracts";
import type { MobileSearchInput } from "./search-api";

export type SearchInputState = {
  query: string;
  scope: SearchScope;
  selectedSubject: { id: string; name: string } | null;
};

export type SearchInputAction =
  | { type: "queryChanged"; query: string }
  | { type: "scopeChanged"; scope: SearchScope }
  | { type: "sharedSearchOpened"; input: MobileSearchInput }
  | {
      type: "subjectSelected";
      subject: { id: string; name: string };
    }
  | { type: "subjectFilterCleared" }
  | { type: "resetAll" };

export const initialSearchInputState: SearchInputState = {
  query: "",
  scope: "all",
  selectedSubject: null,
};

export function searchInputReducer(
  state: SearchInputState,
  action: SearchInputAction,
): SearchInputState {
  switch (action.type) {
    case "resetAll":
      return initialSearchInputState;
    case "queryChanged":
      // Text refinement is a separate dimension of an academic filter.
      // Explicitly clearing Subject is the only action that broadens it.
      return {
        ...state,
        query: action.query.slice(0, 120),
      };
    case "scopeChanged":
      return { ...state, scope: action.scope, selectedSubject: null };
    case "sharedSearchOpened":
      // One atomic transition: never briefly search with the previous
      // person's subject or a stale draft while restoring an external link.
      return {
        query: action.input.q ?? "",
        scope: action.input.scope,
        selectedSubject: action.input.subjectId
          ? { id: action.input.subjectId, name: "esta materia" }
          : null,
      };
    case "subjectSelected":
      return {
        query: "",
        scope: "resources",
        selectedSubject: action.subject,
      };
    case "subjectFilterCleared":
      // Keep a meaningful typed query when broadening from one Subject to
      // resources across all Subjects. Subject-only browsing returns Home.
      return state.query.trim()
        ? { ...state, scope: "resources", selectedSubject: null }
        : initialSearchInputState;
  }
}

/**
 * One source of truth for what Search may send to the server.
 * A one-character refinement must NOT silently fall back to an unfiltered
 * Subject-only query (nor send an invalid too-short search).
 */
export function searchInputForState(
  state: SearchInputState,
): MobileSearchInput | null {
  const q = state.query.trim();
  const subjectId = state.selectedSubject?.id;
  if (q.length >= 2) {
    return {
      q,
      scope: state.scope,
      ...(state.scope === "resources" && subjectId ? { subjectId } : {}),
    };
  }
  if (
    state.query.length === 0 &&
    q.length === 0 &&
    state.scope === "resources" &&
    subjectId
  ) {
    return { scope: "resources", subjectId };
  }
  return null;
}
