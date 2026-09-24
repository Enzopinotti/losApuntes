export type FeedMode = "balanced" | "study" | "discover" | "community";
export type FeedOrder = "ranked" | "chronological";
export type FeedTargetType = "resource" | "question" | "organization_post";
export type FeedFeedbackSignal = "more" | "less";

export type FeedReasonCode =
  | "current_subject"
  | "prioritized_subject"
  | "connection"
  | "following"
  | "organization_following"
  | "interest_match"
  | "unanswered_question"
  | "fresh"
  | "explicit_more"
  | "exploration";

export type FeedItem = {
  type: FeedTargetType;
  id: string;
  title: string;
  summary: string;
  author: {
    profileId: string | null;
    displayName: string;
    avatarUrl: string | null;
  };
  source:
    | { kind: "personal_user" }
    | {
        kind: "campus_organization";
        organization: {
          id: string;
          name: string;
          avatarUrl: string | null;
          verificationState: "unverified" | "verified";
        };
      };
  academic: {
    subject: {
      id: string;
      name: string;
    } | null;
  };
  why: FeedReasonCode[];
  createdAt: string;
};

export type FeedPreferences = {
  useAcademic: boolean;
  useSocial: boolean;
  useInterests: boolean;
  mutedSubjectIds: string[];
  mutedProfileIds: string[];
  prioritizedSubjectIds: string[];
  revision: number;
};

export type FeedPreferencesResponse = {
  preferences: FeedPreferences;
  effectiveSignals: {
    academic: boolean;
    social: boolean;
    interests: boolean;
  };
};

export type FeedPageResponse = {
  items: FeedItem[];
  nextCursor: string | null;
  stopReason: "end" | "natural_break" | null;
};

export type AcademicFeedResponse = FeedPageResponse & {
  context: {
    subjectIds: string[];
  };
};

export type ForYouFeedResponse = FeedPageResponse & {
  effectiveSignals: {
    academic: boolean;
    social: boolean;
    interests: boolean;
    relationWindowTruncated: boolean;
  };
};
