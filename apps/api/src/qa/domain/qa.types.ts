export const QUESTION_STATES = ['open', 'closed'] as const;
export type QuestionState = (typeof QUESTION_STATES)[number];

export const QA_MODERATION_STATES = ['available', 'hidden'] as const;
export type QaModerationState = (typeof QA_MODERATION_STATES)[number];

export const QA_REPORT_REASONS = [
  'spam',
  'plagiarism',
  'harassment',
  'misinformation',
  'inappropriate',
  'other',
] as const;
export type QaReportReason = (typeof QA_REPORT_REASONS)[number];

export const QA_REPORT_STATUSES = ['pending', 'resolved', 'dismissed'] as const;
export type QaReportStatus = (typeof QA_REPORT_STATUSES)[number];

export interface QuestionRecord {
  id: string;
  authorUserId: string;
  subjectId: string;
  courseOfferingId: string | null;
  title: string;
  body: string;
  searchText: string;
  state: QuestionState;
  moderationState: QaModerationState;
  answerCount: number;
  acceptedAnswerId: string | null;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnswerRecord {
  id: string;
  questionId: string;
  authorUserId: string;
  body: string;
  moderationState: QaModerationState;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface QaReportRecord {
  id: string;
  targetType: 'question' | 'answer';
  targetId: string;
  reporterUserId: string;
  reason: QaReportReason;
  details: string | null;
  status: QaReportStatus;
  reviewedByUserId?: string;
  reviewedAt?: Date;
  reviewReason?: string;
  reviewAction?: 'hide' | 'restore' | 'dismiss';
  createdAt: Date;
  updatedAt: Date;
}

export interface QuestionCursor {
  updatedAt: Date;
  id: string;
}
