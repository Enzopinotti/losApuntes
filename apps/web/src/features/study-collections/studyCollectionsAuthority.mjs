/**
 * Small, platform-independent guards for the persistent collections UI.
 * All identity and revision decisions are explicit; they never infer authority
 * from resource names or from cached UI metadata.
 */

export function scopedCollectionCreateAttempt(
  previous,
  scope,
  title,
  description,
  newId,
) {
  if (
    typeof scope !== "string" ||
    !scope.startsWith("authenticated:") ||
    typeof title !== "string" ||
    typeof description !== "string" ||
    typeof newId !== "function"
  ) {
    throw new Error("Invalid scoped collection create attempt");
  }

  // JSON array separates values unambiguously, even if they contain newlines.
  const fingerprint = JSON.stringify([title, description]);
  if (
    previous?.scope === scope &&
    previous.fingerprint === fingerprint &&
    typeof previous.key === "string"
  ) {
    return previous;
  }
  const key = newId();
  if (typeof key !== "string" || !key) {
    throw new Error("Invalid collection operation key");
  }
  return { scope, fingerprint, key };
}

export function isConsistentCollectionPage(
  headerRevision,
  pageRevision,
  previousRevision,
  append,
) {
  if (
    !Number.isSafeInteger(headerRevision) ||
    headerRevision < 1 ||
    !Number.isSafeInteger(pageRevision) ||
    pageRevision < 1 ||
    headerRevision !== pageRevision
  ) return false;

  // A later page cannot be concatenated onto a different version of the
  // collection, even when both newly fetched endpoints agree with each other.
  return (
    append !== true ||
    (Number.isSafeInteger(previousRevision) &&
      previousRevision === headerRevision)
  );
}

export function releaseScopedCollectionAction(currentLease, finishedLease) {
  return currentLease === finishedLease ? null : currentLease;
}
