export function studyKitCursorRepeats(
  usedCursors: ReadonlySet<string>,
  requestedCursor: string,
  nextCursor: string | null,
): boolean {
  return (
    nextCursor !== null &&
    (nextCursor === requestedCursor || usedCursors.has(nextCursor))
  );
}
