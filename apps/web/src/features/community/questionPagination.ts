export function questionCursorRepeats(
  loadedCursors: ReadonlySet<string>,
  requestedCursor: string,
  nextCursor: string | null,
): boolean {
  return (
    nextCursor !== null &&
    (nextCursor === requestedCursor || loadedCursors.has(nextCursor))
  );
}

export function appendUniqueItems<T extends { id: string }>(
  current: T[],
  next: T[],
): T[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of next) byId.set(item.id, item);
  return [...byId.values()];
}
