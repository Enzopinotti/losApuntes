import type { CommunityPerson } from "@losapuntes/contracts/social-qa";

export type {
  AnswerPageResponse,
  AnswerView,
  CommunityPerson,
  ConnectionStatus,
  ConnectionView,
  FollowingItem,
  QuestionDetailResponse,
  QuestionSearchResponse,
  QuestionState,
  QuestionView,
} from "@losapuntes/contracts/social-qa";

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
