import type { FeedMode } from "./interfaces";

export interface FullFeedEmptyGuidance {
  message: string;
  href: string;
  actionLabel: string;
}

export declare function fullFeedEmptyGuidance(
  view: "academic" | "for-you",
  mode: FeedMode,
): FullFeedEmptyGuidance;
