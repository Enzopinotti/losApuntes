export function organizationContentCursorRepeats(
  loadedCursors: ReadonlySet<string>,
  requestedCursor: string,
  nextCursor: string | null,
): boolean {
  return (
    nextCursor !== null &&
    (nextCursor === requestedCursor || loadedCursors.has(nextCursor))
  );
}
