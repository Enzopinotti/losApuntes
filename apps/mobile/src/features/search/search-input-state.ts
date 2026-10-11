import type { SearchScope } from "@losapuntes/contracts";

export type SearchInputState = {
  query: string;
  scope: SearchScope;
  subjectId: string | null;
};

export type SearchInputAction =
  | { type: "queryChanged"; query: string }
  | { type: "scopeChanged"; scope: SearchScope }
  | { type: "subjectSelected"; subjectId: string }
  | { type: "subjectFilterCleared" };

export const initialSearchInputState: SearchInputState = {
  query: "",
  scope: "all",
  subjectId: null,
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
        subjectId: null,
      };
    case "scopeChanged":
      return { ...state, scope: action.scope, subjectId: null };
    case "subjectSelected":
      return {
        query: "",
        scope: "resources",
        subjectId: action.subjectId,
      };
    case "subjectFilterCleared":
      return initialSearchInputState;
  }
}
