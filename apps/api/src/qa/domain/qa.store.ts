import type { CreateNotificationRecord } from '../../notifications/domain/notification.types';
import type {
  AnswerRecord,
  QaReportReason,
  QaReportRecord,
  QuestionCursor,
  QuestionRecord,
  QuestionState,
} from './qa.types';

export const QA_STORE = Symbol('QA_STORE');

export type CreateQuestionRecord = Omit<
  QuestionRecord,
  'createdAt' | 'updatedAt'
>;

export type CreateAnswerRecord = Omit<AnswerRecord, 'createdAt' | 'updatedAt'>;

export interface QaStore {
  createQuestion: (input: CreateQuestionRecord) => Promise<QuestionRecord>;
  findQuestion: (id: string) => Promise<QuestionRecord | null>;
  searchQuestions: (input: {
    q?: string;
    subjectId?: string;
    state?: QuestionState;
    limit: number;
    after?: QuestionCursor;
  }) => Promise<{ items: QuestionRecord[]; hasMore: boolean }>;
  updateQuestionOwned: (
    id: string,
    authorUserId: string,
    expectedRevision: number,
    patch: Partial<
      Pick<QuestionRecord, 'title' | 'body' | 'searchText' | 'state'>
    >,
  ) => Promise<QuestionRecord | null>;

  listAnswers: (questionId: string, limit: number) => Promise<AnswerRecord[]>;
  findAnswer: (id: string) => Promise<AnswerRecord | null>;
  createAnswerAtomic: (input: {
    answer: CreateAnswerRecord;
    notification?: CreateNotificationRecord;
  }) => Promise<AnswerRecord | null>;
  updateAnswerOwned: (
    id: string,
    authorUserId: string,
    expectedRevision: number,
    body: string,
  ) => Promise<AnswerRecord | null>;
  acceptAnswerAtomic: (input: {
    questionId: string;
    answerId: string;
    authorUserId: string;
    expectedRevision: number;
    notification?: CreateNotificationRecord;
  }) => Promise<QuestionRecord | null>;

  upsertPendingReport: (input: {
    id: string;
    targetType: 'question' | 'answer';
    targetId: string;
    reporterUserId: string;
    reason: QaReportReason;
    details: string | null;
  }) => Promise<QaReportRecord>;
}
