import type { FeedMode, FeedOrder } from "./interfaces";

export type FeedView = "academic" | "for-you";
export type HomeFeedIntent = "contextual" | "for-you";

export interface FeedSelection {
  view: FeedView;
  mode: FeedMode;
  order: FeedOrder;
}

export declare function feedReturnHref(locationState: unknown): string | null;

export declare function feedReturnRestoreState(locationState: unknown): {
  feedRestoreTo: string;
  feedRestoreKey: string;
  feedRestoreHomeIntent?: HomeFeedIntent;
} | null;

export declare function feedReturnScrollKey(
  locationState: unknown,
): string | null;

export declare function feedReturnHomeIntent(
  locationState: unknown,
): HomeFeedIntent | null;

export declare function feedRestoreHomeIntent(
  locationState: unknown,
  currentHref: string,
): HomeFeedIntent | null;

export declare function feedSelectionFromSearchParams(searchParams: {
  get(name: string): string | null;
}): FeedSelection;

export declare function homeFeedHref(
  intent: HomeFeedIntent,
  homeFeedKind: "subjects" | "community" | null,
): string;
