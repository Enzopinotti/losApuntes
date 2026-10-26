export function repeatsNetworkCursor(requestedCursors, cursor, nextCursor) {
  return (
    nextCursor !== null &&
    (nextCursor === cursor || requestedCursors.has(nextCursor))
  );
}

export function appendUniqueNetworkItems(current, next, keyForItem) {
  const byId = new Map(current.map((item) => [keyForItem(item), item]));
  for (const item of next) byId.set(keyForItem(item), item);
  return [...byId.values()];
}
