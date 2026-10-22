export type ScopedCollectionCreateAttempt = {
  scope: string;
  fingerprint: string;
  key: string;
};
export declare function scopedCollectionCreateAttempt(
  previous: ScopedCollectionCreateAttempt | null,
  scope: string,
  title: string,
  description: string,
  newId: () => string,
): ScopedCollectionCreateAttempt;
export declare function isConsistentCollectionPage(
  headerRevision: number,
  pageRevision: number,
  previousRevision: number | null,
  append: boolean,
): boolean;
export declare function releaseScopedCollectionAction<T>(
  currentLease: T | null,
  finishedLease: T,
): T | null;
