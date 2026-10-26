export function repeatsSocialCursor(
  requestedCursors: ReadonlySet<string>,
  cursor: string,
  nextCursor: string | null,
): boolean {
  return (
    nextCursor !== null &&
    (nextCursor === cursor || requestedCursors.has(nextCursor))
  );
}
