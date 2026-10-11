import type { SearchScope } from "@losapuntes/contracts";

export type SearchInputState = {
  query: string;
  scope: SearchScope;
  selectedSubject: { id: string; name: string } | null;
};

export type SearchInputAction =
  | { type: "queryChanged"; query: string }
  | { type: "scopeChanged"; scope: SearchScope }
  | {
      type: "subjectSelected";
      subject: { id: string; name: string };
    }
  | { type: "subjectFilterCleared" };

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
    case "queryChanged":
      return {
        ...state,
        query: action.query.slice(0, 120),
        selectedSubject: null,
      };
    case "scopeChanged":
      return { ...state, scope: action.scope, selectedSubject: null };
    case "subjectSelected":
      return {
        query: "",
        scope: "resources",
        selectedSubject: action.subject,
      };
    case "subjectFilterCleared":
      return initialSearchInputState;
  }
}
