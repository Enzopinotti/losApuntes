export function repeatsNetworkCursor(
  requestedCursors: ReadonlySet<string>,
  cursor: string,
  nextCursor: string | null,
): boolean;

export function appendUniqueNetworkItems<T>(
  current: T[],
  next: T[],
  keyForItem: (item: T) => string,
): T[];
