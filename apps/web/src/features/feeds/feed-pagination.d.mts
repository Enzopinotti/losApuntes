import type { FeedItem } from "./interfaces";

export declare const FEED_PREFETCH_ROOT_MARGIN: string;

export interface WebFeedContinuationState {
  nextCursor: string | null;
  stopReason: "end" | "natural_break" | null;
  loading: boolean;
  busy: string | null;
  hasError: boolean;
}

export declare function canAutomaticallyLoadWebFeed(
  state: WebFeedContinuationState,
): boolean;

export declare function appendUniqueFeedItems(
  existing: readonly FeedItem[],
  incoming: readonly FeedItem[],
): FeedItem[];

export declare function feedPageLoadedAnnouncement(
  newItemCount: number,
): string;

export declare function didFeedCursorAdvance(
  currentCursor: string,
  nextCursor: string | null,
  usedCursors?: ReadonlySet<string>,
): boolean;

export declare function requiresNewWebFeedSession(errorCode: string): boolean;
