import type { AcademicCurrentContext } from "./academic.js";

export type FeedTargetType = "resource" | "question" | "organization_post";

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

export interface FeedItem {
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
}

export interface FeedPageResponse {
  items: FeedItem[];
  nextCursor: string | null;
  stopReason: "end" | "natural_break" | null;
}

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

export type PilotHomeResponse = {
  profileReady: boolean;
  lifecycle: {
    phase: "student" | "alumni" | "mixed" | "community";
    activeStudentAffiliationIds: string[];
    alumniAffiliationIds: string[];
    currentSubjectIds: string[];
    hasCurrentSubjectContext: boolean;
    currentAffiliationId: string | null;
    follows: Array<{
      targetId: string;
      kind: "institution" | "program";
      name: string;
    }>;
    followsTruncated: boolean;
    followsLimit: number;
  };
  academic: {
    currentContext: AcademicCurrentContext | null;
    currentSubjectIds: string[];
  };
  homeFeed: FeedPageResponse & {
    kind: "subjects" | "community";
  };
  academicFeed: AcademicFeedResponse;
  forYou: ForYouFeedResponse;
  notifications: {
    unreadCount: number;
  };
};
