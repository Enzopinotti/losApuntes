import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { Connection, FilterQuery, Model } from 'mongoose';

import type { CreateNotificationRecord } from '../../notifications/domain/notification.types';
import { Notification } from '../../notifications/mongo/notification.mongo-schema';
import type {
  CreateAnswerRecord,
  CreateQuestionRecord,
  QaStore,
} from '../domain/qa.store';
import type {
  AnswerRecord,
  QaReportRecord,
  QuestionCursor,
  QuestionRecord,
  QuestionState,
} from '../domain/qa.types';
import { Answer, QaReport, Question } from './qa.mongo-schemas';

function escapeRegex(value: string): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/gu,
    (character) => '\\' + character,
  );
}

function toPlain<T>(value: { toObject(): unknown } | T): T {
  if (
    typeof value === 'object' &&
    value !== null &&
    'toObject' in value &&
    typeof value.toObject === 'function'
  ) {
    return value.toObject() as T;
  }

  return value as T;
}

@Injectable()
export class MongoQaStore implements QaStore {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
    @InjectModel(Question.name)
    private readonly questions: Model<Question>,
    @InjectModel(Answer.name)
    private readonly answers: Model<Answer>,
    @InjectModel(QaReport.name)
    private readonly reports: Model<QaReport>,
    @InjectModel(Notification.name)
    private readonly notifications: Model<Notification>,
  ) {}

  async createQuestion(input: CreateQuestionRecord): Promise<QuestionRecord> {
    const created = await this.questions.create(input);
    return toPlain<QuestionRecord>(created);
  }

  async findQuestion(id: string): Promise<QuestionRecord | null> {
    return this.questions.findOne({ id }).lean<QuestionRecord>().exec();
  }

  async searchQuestions(input: {
    q?: string;
    subjectId?: string;
    state?: QuestionState;
    limit: number;
    after?: QuestionCursor;
  }): Promise<{ items: QuestionRecord[]; hasMore: boolean }> {
    const filters: FilterQuery<Question>[] = [{ moderationState: 'available' }];

    if (input.subjectId) filters.push({ subjectId: input.subjectId });
    if (input.state) filters.push({ state: input.state });

    if (input.q) {
      filters.push({
        searchText: {
          $regex: escapeRegex(input.q),
          $options: 'i',
        },
      });
    }

    if (input.after) {
      filters.push({
        $or: [
          { updatedAt: { $lt: input.after.updatedAt } },
          {
            updatedAt: input.after.updatedAt,
            id: { $gt: input.after.id },
          },
        ],
      });
    }

    const rows = await this.questions
      .find({ $and: filters })
      .sort({ updatedAt: -1, id: 1 })
      .limit(input.limit + 1)
      .lean<QuestionRecord[]>()
      .exec();

    return {
      items: rows.slice(0, input.limit),
      hasMore: rows.length > input.limit,
    };
  }

  async updateQuestionOwned(
    id: string,
    authorUserId: string,
    expectedRevision: number,
    patch: Partial<
      Pick<QuestionRecord, 'title' | 'body' | 'searchText' | 'state'>
    >,
  ): Promise<QuestionRecord | null> {
    return this.questions
      .findOneAndUpdate(
        {
          id,
          authorUserId,
          moderationState: 'available',
          revision: expectedRevision,
        },
        { $set: patch, $inc: { revision: 1 } },
        { new: true },
      )
      .lean<QuestionRecord>()
      .exec();
  }

  async listAnswers(
    questionId: string,
    limit: number,
  ): Promise<AnswerRecord[]> {
    return this.answers
      .find({ questionId, moderationState: 'available' })
      .sort({ createdAt: 1, id: 1 })
      .limit(limit)
      .lean<AnswerRecord[]>()
      .exec();
  }

  async findAnswer(id: string): Promise<AnswerRecord | null> {
    return this.answers.findOne({ id }).lean<AnswerRecord>().exec();
  }

  async createAnswerAtomic(input: {
    answer: CreateAnswerRecord;
    notification?: CreateNotificationRecord;
  }): Promise<AnswerRecord | null> {
    const session = await this.connection.startSession();

    try {
      let result: AnswerRecord | null = null;

      await session.withTransaction(async () => {
        const question = await this.questions
          .findOneAndUpdate(
            {
              id: input.answer.questionId,
              state: 'open',
              moderationState: 'available',
            },
            { $inc: { answerCount: 1 } },
            { new: true, session },
          )
          .lean<QuestionRecord>()
          .exec();

        if (!question) return;

        const created = await this.answers.create([input.answer], { session });
        const answer = created[0];
        if (!answer) throw new Error('Answer create returned no row');

        if (input.notification) {
          await this.notifications.create([input.notification], { session });
        }

        result = toPlain<AnswerRecord>(answer);
      });

      return result;
    } finally {
      await session.endSession();
    }
  }

  async updateAnswerOwned(
    id: string,
    authorUserId: string,
    expectedRevision: number,
    body: string,
  ): Promise<AnswerRecord | null> {
    return this.answers
      .findOneAndUpdate(
        {
          id,
          authorUserId,
          moderationState: 'available',
          revision: expectedRevision,
        },
        { $set: { body }, $inc: { revision: 1 } },
        { new: true },
      )
      .lean<AnswerRecord>()
      .exec();
  }

  async acceptAnswerAtomic(input: {
    questionId: string;
    answerId: string;
    authorUserId: string;
    expectedRevision: number;
    notification?: CreateNotificationRecord;
  }): Promise<QuestionRecord | null> {
    const session = await this.connection.startSession();

    try {
      let result: QuestionRecord | null = null;

      await session.withTransaction(async () => {
        const answer = await this.answers
          .findOne({
            id: input.answerId,
            questionId: input.questionId,
            moderationState: 'available',
          })
          .session(session)
          .lean<AnswerRecord>()
          .exec();

        if (!answer) return;

        result = await this.questions
          .findOneAndUpdate(
            {
              id: input.questionId,
              authorUserId: input.authorUserId,
              moderationState: 'available',
              revision: input.expectedRevision,
            },
            {
              $set: { acceptedAnswerId: input.answerId },
              $inc: { revision: 1 },
            },
            { new: true, session },
          )
          .lean<QuestionRecord>()
          .exec();

        if (result && input.notification) {
          await this.notifications.create([input.notification], { session });
        }
      });

      return result;
    } finally {
      await session.endSession();
    }
  }

  async upsertPendingReport(input: {
    id: string;
    targetType: 'question' | 'answer';
    targetId: string;
    reporterUserId: string;
    reason: QaReportRecord['reason'];
    details: string | null;
  }): Promise<QaReportRecord> {
    const record = await this.reports
      .findOneAndUpdate(
        {
          targetType: input.targetType,
          targetId: input.targetId,
          reporterUserId: input.reporterUserId,
          status: 'pending',
        },
        {
          $setOnInsert: {
            ...input,
            status: 'pending',
          },
        },
        { upsert: true, new: true },
      )
      .lean<QaReportRecord>()
      .exec();

    if (!record) throw new Error('Q&A report upsert returned no row');
    return record;
  }
}
