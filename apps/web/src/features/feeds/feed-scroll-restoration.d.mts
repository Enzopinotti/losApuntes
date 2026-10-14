export declare function feedScrollAuthorityScope(
  status: unknown,
  userId: unknown,
  sessionId: unknown,
): string;

export declare function rememberFeedScrollPosition(
  key: unknown,
  authorityScope: unknown,
  scrollY: number,
): boolean;

export declare function takeFeedScrollPosition(
  key: unknown,
  authorityScope: unknown,
): number | null;

export declare function clearFeedScrollPositions(): void;

export declare function feedRestorePositionKey(
  locationState: unknown,
  currentHref: string,
): string | null;
