export interface CommunityPerson {
  profileId: string;
  displayName: string;
  avatarUrl: string | null;
}

export type QuestionState = "open" | "closed";

export interface QuestionView {
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
}

export interface AnswerView {
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
}

export interface QuestionSearchResponse {
  items: QuestionView[];
  nextCursor: string | null;
}

export interface AnswerPageResponse {
  items: AnswerView[];
  nextCursor: string | null;
}

export interface QuestionDetailResponse {
  question: QuestionView;
  answers: AnswerView[];
  answersNextCursor: string | null;
  answersLimit: number;
}

export interface CreateQuestionInput {
  subjectId: string;
  courseOfferingId?: string;
  title: string;
  body: string;
}

export interface CreateAnswerInput {
  body: string;
}
