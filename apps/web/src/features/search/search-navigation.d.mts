import type { SearchScope } from "./interfaces";

export type SharedSearchSelection = Readonly<{
  q: string;
  scope: SearchScope;
  subjectId?: string;
}>;

export declare function searchSelectionFromSearchParams(params: {
  get(name: string): string | null;
  getAll(name: string): string[];
  has(name: string): boolean;
}): SharedSearchSelection | null;

export declare function searchSelectionHref(
  selection: SharedSearchSelection,
): string | null;

export declare function searchSelectionKey(
  selection: SharedSearchSelection | null,
): string | null;

export declare function searchReturnHref(locationState: unknown): string | null;
