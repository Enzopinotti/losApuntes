export const FEED_MODES = [
  'balanced',
  'study',
  'discover',
  'community',
] as const;

export type FeedMode = (typeof FEED_MODES)[number];

export const FEED_ORDERS = ['ranked', 'chronological'] as const;
export type FeedOrder = (typeof FEED_ORDERS)[number];

export const FEED_TARGET_TYPES = [
  'resource',
  'question',
  'organization_post',
] as const;
export type FeedTargetType = (typeof FEED_TARGET_TYPES)[number];

export const FEED_FEEDBACK_SIGNALS = ['more', 'less'] as const;
export type FeedFeedbackSignal = (typeof FEED_FEEDBACK_SIGNALS)[number];

export const FEED_REASON_CODES = [
  'current_subject',
  'prioritized_subject',
  'connection',
  'following',
  'organization_following',
  'interest_match',
  'unanswered_question',
  'fresh',
  'explicit_more',
  'exploration',
] as const;

export type FeedReasonCode = (typeof FEED_REASON_CODES)[number];

export interface FeedPreferencesRecord {
  userId: string;
  useAcademic: boolean;
  useSocial: boolean;
  useInterests: boolean;
  mutedSubjectIds: string[];
  mutedProfileIds: string[];
  prioritizedSubjectIds: string[];
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FeedFeedbackRecord {
  userId: string;
  targetType: FeedTargetType;
  targetId: string;
  signal: FeedFeedbackSignal;
  createdAt: Date;
  updatedAt: Date;
}

export interface FeedCursor {
  anchorAt: Date;
  revision: number;
  page: number;
  offset: number;
  mode: FeedMode;
  order: FeedOrder;
}
