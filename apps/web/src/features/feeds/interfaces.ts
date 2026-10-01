export type {
  AcademicFeedResponse,
  FeedItem,
  FeedPageResponse,
  FeedReasonCode,
  FeedTargetType,
  ForYouFeedResponse,
} from "@losapuntes/contracts";

export type FeedMode = "balanced" | "study" | "discover" | "community";
export type FeedOrder = "ranked" | "chronological";
export type FeedFeedbackSignal = "more" | "less";

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
