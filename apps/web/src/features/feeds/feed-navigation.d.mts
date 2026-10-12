import type { FeedMode, FeedOrder } from "./interfaces";

export type FeedView = "academic" | "for-you";

export interface FeedSelection {
  view: FeedView;
  mode: FeedMode;
  order: FeedOrder;
}

export declare function feedSelectionFromSearchParams(searchParams: {
  get(name: string): string | null;
}): FeedSelection;

export declare function homeFeedHref(
  intent: "contextual" | "for-you",
  homeFeedKind: "subjects" | "community" | null,
): string;
