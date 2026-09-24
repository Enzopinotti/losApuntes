import type { AcademicLifecycleResponse } from "../academic/interfaces";
import type {
  AcademicFeedResponse,
  FeedPageResponse,
  ForYouFeedResponse,
} from "../feeds/interfaces";

export type PilotHomeResponse = {
  profileReady: boolean;
  lifecycle: AcademicLifecycleResponse;
  academic: {
    currentContext: unknown | null;
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

export type PilotModerationStatus = "pending" | "resolved" | "dismissed";
export type PilotModerationAction = "hide" | "restore" | "dismiss";
export type PilotReportKind = "resource" | "qa";

export type PilotModerationItem = {
  kind: PilotReportKind;
  reportId: string;
  targetKind: "resource" | "question" | "answer";
  targetId: string;
  reason: string;
  details: string | null;
  status: PilotModerationStatus;
  reporterUserId: string;
  createdAt: string;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  reviewReason: string | null;
  action: PilotModerationAction | null;
  target: {
    title: string;
    preview: string;
    moderationState: "available" | "hidden";
  };
};

export type PilotModerationResponse = {
  items: PilotModerationItem[];
};

export type PilotMetricsResponse = {
  window: {
    from: string;
    to: string;
    days: number;
  };
  onboarding: {
    accountsCreated: number;
    profilesCompleted: number;
    dropOff: number;
    completionRate: number;
  };
  search: {
    searches: number;
    noResultSearches: number;
    noResultRate: number;
  };
  activity: {
    activeUsers: number;
    returningUsers: number;
    returningRate: number;
  };
  audience: {
    activeStudents: {
      activeUsers: number;
      returningUsers: number;
    };
    alumni: {
      activeUsers: number;
      returningUsers: number;
    };
    community: {
      activeUsers: number;
      returningUsers: number;
    };
  };
  contributions: {
    events: number;
    contributors: number;
    contributionRate: number;
  };
  moderation: {
    pending: number;
    reviewedInWindow: number;
    oldestPendingAt: string | null;
  };
  subjects: Array<{
    subjectId: string;
    subjectName: string | null;
    currentParticipants: number;
    resources: number;
    openQuestions: number;
    contributionEvents: number;
  }>;
  subjectsTruncated: boolean;
};
