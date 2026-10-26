export function repeatsNotificationCursor(
  requestedCursors,
  cursor,
  nextCursor,
) {
  return (
    nextCursor !== null &&
    (nextCursor === cursor || requestedCursors.has(nextCursor))
  );
}

export function appendUniqueNotifications(current, next) {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of next) byId.set(item.id, item);
  return [...byId.values()];
}
