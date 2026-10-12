import type { FeedItem } from "./interfaces";

export interface FeedItemPresentation {
  kindLabel: string;
  displayName: string;
  avatarUrl: string | null;
  subjectName: string | null;
  verifiedOrganization: boolean;
  reasonLabels: string[];
  createdAtLabel: string | null;
  href: string;
  actionLabel: string;
}

export declare function presentFeedItem(
  item: FeedItem,
  reasonLimit?: number,
): FeedItemPresentation;
