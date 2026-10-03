import type { CommunityPerson } from "@losapuntes/contracts/social-qa";

export type {
  AnswerPageResponse,
  AnswerView,
  CommunityPerson,
  QuestionDetailResponse,
  QuestionSearchResponse,
  QuestionState,
  QuestionView,
} from "@losapuntes/contracts/social-qa";

export type FollowingItem = {
  followedAt: string;
  profile: CommunityPerson;
};

export type ConnectionStatus =
  "pending" | "accepted" | "declined" | "disconnected";

export type ConnectionView = {
  id: string;
  status: ConnectionStatus;
  other: CommunityPerson;
  requestedByMe: boolean;
  incoming: boolean;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NotificationType =
  | "social.followed"
  | "social.connection_requested"
  | "social.connection_accepted"
  | "qa.question_answered"
  | "qa.answer_accepted";

export type NotificationView = {
  id: string;
  type: NotificationType;
  actor: CommunityPerson | null;
  target: {
    type: "profile" | "connection" | "question" | "answer";
    id: string;
  };
  readAt: string | null;
  createdAt: string;
};
