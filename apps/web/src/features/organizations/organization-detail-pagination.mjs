export function repeatsOrganizationDetailCursor(
  requestedCursors,
  cursor,
  nextCursor,
) {
  return (
    nextCursor !== null &&
    (nextCursor === cursor || requestedCursors.has(nextCursor))
  );
}
