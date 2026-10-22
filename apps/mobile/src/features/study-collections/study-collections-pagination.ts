export function recordStudyCollectionPageCursor(
  history: Set<string>,
  requestedCursor: string,
  nextCursor: string | null,
): boolean {
  const repeated =
    nextCursor !== null &&
    (nextCursor === requestedCursor || history.has(nextCursor));
  history.add(requestedCursor);
  return repeated;
}
