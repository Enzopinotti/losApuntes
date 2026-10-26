export function organizationDirectoryCursorRepeats(
  requestedCursors: ReadonlySet<string>,
  requestedCursor: string,
  nextCursor: string | null,
): boolean;

export function appendUniqueOrganizations<T extends { id: string }>(
  current: T[],
  next: T[],
): T[];
