export function repeatsOrganizationDirectoryCursor(
  requestedCursors,
  requestedCursor,
  nextCursor,
) {
  return (
    nextCursor !== null &&
    (nextCursor === requestedCursor || requestedCursors.has(nextCursor))
  );
}
