export function collectionRecoveryCursorRepeats(
  usedCursors: ReadonlySet<string>,
  requestedCursor: string | undefined,
  nextCursor: string | null,
): boolean {
  return (
    nextCursor !== null &&
    (nextCursor === requestedCursor || usedCursors.has(nextCursor))
  );
}
