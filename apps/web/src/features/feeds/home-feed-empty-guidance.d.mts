export interface HomeFeedEmptyGuidance {
  message: string;
  href: string;
  actionLabel: string;
}

export declare function homeFeedEmptyGuidance(
  intent: "contextual" | "for-you",
  homeFeedKind: "subjects" | "community",
): HomeFeedEmptyGuidance;
