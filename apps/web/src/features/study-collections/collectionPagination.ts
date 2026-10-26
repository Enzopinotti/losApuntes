export function collectionCursorRepeats(
  usedCursors: ReadonlySet<string>,
  requestedCursor: string,
  nextCursor: string | null,
): boolean {
  return (
    nextCursor !== null &&
    (nextCursor === requestedCursor || usedCursors.has(nextCursor))
  );
}

export function appendUniqueBy<T>(
  current: T[],
  next: T[],
  getKey: (item: T) => string,
): T[] {
  const byKey = new Map(current.map((item) => [getKey(item), item]));
  for (const item of next) byKey.set(getKey(item), item);
  return [...byKey.values()];
}
