/** Current and previously visited cursors must not be requested again. */
export function organizationDirectoryCursorRepeats(
  requestedCursors,
  requestedCursor,
  nextCursor,
) {
  return (
    nextCursor !== null &&
    (nextCursor === requestedCursor || requestedCursors.has(nextCursor))
  );
}

/** Preserve the first-page order while refreshing already-seen IDs. */
export function appendUniqueOrganizations(current, next) {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of next) byId.set(item.id, item);
  return [...byId.values()];
}
