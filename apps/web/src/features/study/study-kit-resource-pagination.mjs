export function repeatsStudyKitResourceCursor(
  requestedCursors,
  cursor,
  nextCursor,
) {
  return (
    nextCursor !== null &&
    (nextCursor === cursor || requestedCursors.has(nextCursor))
  );
}
