export type CommunityPerson = {
  profileId: string;
  displayName: string;
  avatarUrl: string | null;
};

export type FollowingItem = {
  followedAt: string;
  profile: CommunityPerson;
};

export type ConnectionStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "disconnected";

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

export type QuestionState = "open" | "closed";

export type QuestionView = {
  id: string;
  author: CommunityPerson | null;
  academic: {
    subject: { id: string; name: string };
    courseOffering: { id: string; name: string } | null;
  };
  title: string;
  body: string;
  state: QuestionState;
  answerCount: number;
  acceptedAnswerId: string | null;
  revision: number;
  viewer: {
    canEdit: boolean;
    canAnswer: boolean;
    canAcceptAnswers: boolean;
    canReport: boolean;
  };
  createdAt: string;
  updatedAt: string;
};

export type AnswerView = {
  id: string;
  questionId: string;
  author: CommunityPerson | null;
  body: string;
  revision: number;
  viewer: {
    canEdit: boolean;
    canReport: boolean;
  };
  createdAt: string;
  updatedAt: string;
};

export type QuestionSearchResponse = {
  items: QuestionView[];
  nextCursor: string | null;
};

export type QuestionDetailResponse = {
  question: QuestionView;
  answers: AnswerView[];
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
