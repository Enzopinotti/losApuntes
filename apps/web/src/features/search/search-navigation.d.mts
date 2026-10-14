import type { SearchScope } from "./interfaces";

export type SharedSearchSelection = Readonly<{
  q: string;
  scope: SearchScope;
}>;

export declare function searchSelectionFromSearchParams(params: {
  get(name: string): string | null;
}): SharedSearchSelection | null;

export declare function searchSelectionHref(
  selection: SharedSearchSelection,
): string | null;

export declare function searchSelectionKey(
  selection: SharedSearchSelection | null,
): string | null;
