import type { FeedItem } from "./interfaces";

export const HOME_DISMISS_LIMIT: 16;
export function homeFeedItemKey(item: Pick<FeedItem, "type" | "id">): string;
export function projectHomeFeed(
  items: FeedItem[],
  hiddenKeys: string[],
): Readonly<{ visible: FeedItem[]; hiddenCount: number }>;
export function hideHomeFeedItem(
  items: FeedItem[],
  hiddenKeys: string[],
  item: Pick<FeedItem, "type" | "id">,
): string[];
export function undoHomeFeedHide(hiddenKeys: string[], key: string): string[];
