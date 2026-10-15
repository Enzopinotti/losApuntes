export type SearchSaveFailure =
  | { kind: "uncertain" }
  | { kind: "error"; message: string };

export declare function searchSaveFailure(
  status: number | null,
): SearchSaveFailure;
