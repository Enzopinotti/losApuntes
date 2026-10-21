import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import { Question } from '../qa/mongo/qa.mongo-schemas';

export const QA_DISCUSSIONS_PREVIEW_LIMIT = 15;
const MONGO_MAX_TIME_MS = 5000;

export interface QaDiscussionItem {
  questionId: string;
  subjectId: string;
  title: string;
  state: 'open' | 'closed';
  isQuestionAuthor: boolean;
  ownVisibleAnswersCount: number;
  lastActivityAt: string;
}

export interface QaDiscussionsPreview {
  items: QaDiscussionItem[];
  hasMore: boolean;
}

interface DiscussionAggregateRow {
  questionId: unknown;
  subjectId: unknown;
  title: unknown;
  state: unknown;
  isQuestionAuthor: unknown;
  ownVisibleAnswersCount: unknown;
  lastActivityAt: unknown;
}

function invalidAggregate(): never {
  throw new ServiceUnavailableException({
    code: 'QA_DISCUSSIONS_UNAVAILABLE',
    message: 'Q&A discussions are temporarily unavailable',
  });
}

function validIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    value.trim() === value
  );
}

function readItem(row: DiscussionAggregateRow): QaDiscussionItem {
  if (
    !validIdentifier(row.questionId) ||
    !validIdentifier(row.subjectId) ||
    typeof row.title !== 'string' ||
    row.title.trim().length === 0 ||
    row.title.length > 2048 ||
    (row.state !== 'open' && row.state !== 'closed') ||
    typeof row.isQuestionAuthor !== 'boolean' ||
    typeof row.ownVisibleAnswersCount !== 'number' ||
    !Number.isSafeInteger(row.ownVisibleAnswersCount) ||
    row.ownVisibleAnswersCount < 0 ||
    !(row.lastActivityAt instanceof Date) ||
    Number.isNaN(row.lastActivityAt.getTime())
  ) {
    invalidAggregate();
  }

  return {
    questionId: row.questionId,
    subjectId: row.subjectId,
    title: row.title,
    state: row.state,
    isQuestionAuthor: row.isQuestionAuthor,
    ownVisibleAnswersCount: row.ownVisibleAnswersCount,
    lastActivityAt: row.lastActivityAt.toISOString(),
  };
}

@Injectable()
export class QaDiscussionsService {
  constructor(
    @InjectModel(Question.name)
    private readonly questions: Model<Question>,
  ) {}

  async previewForOwner(ownerUserId: string): Promise<QaDiscussionsPreview> {
    // The owner can participate as the question author, answer author,
    // or both. Group the full union before applying the top-N preview.
    // Hidden questions/answers never become an authorization shortcut.
    const rows = await this.questions
      .aggregate<DiscussionAggregateRow>([
        {
          $match: {
            authorUserId: ownerUserId,
            moderationState: 'available',
            state: { $in: ['open', 'closed'] },
          },
        },
        {
          $project: {
            _id: 0,
            questionId: '$id',
            subjectId: 1,
            title: 1,
            state: 1,
            isQuestionAuthor: { $literal: true },
            ownVisibleAnswersCount: { $literal: 0 },
            lastActivityAt: '$updatedAt',
          },
        },
        {
          $unionWith: {
            coll: 'answers',
            pipeline: [
              {
                $match: {
                  authorUserId: ownerUserId,
                  moderationState: 'available',
                },
              },
              {
                $lookup: {
                  from: 'questions',
                  let: { questionId: '$questionId' },
                  pipeline: [
                    {
                      $match: {
                        $expr: { $eq: ['$id', '$$questionId'] },
                        moderationState: 'available',
                        state: { $in: ['open', 'closed'] },
                      },
                    },
                    {
                      $project: {
                        _id: 0,
                        id: 1,
                        subjectId: 1,
                        title: 1,
                        state: 1,
                      },
                    },
                    { $limit: 1 },
                  ],
                  as: 'visibleQuestion',
                },
              },
              { $unwind: '$visibleQuestion' },
              {
                $project: {
                  _id: 0,
                  questionId: '$visibleQuestion.id',
                  subjectId: '$visibleQuestion.subjectId',
                  title: '$visibleQuestion.title',
                  state: '$visibleQuestion.state',
                  isQuestionAuthor: { $literal: false },
                  ownVisibleAnswersCount: { $literal: 1 },
                  lastActivityAt: '$updatedAt',
                },
              },
            ],
          },
        },
        {
          $group: {
            _id: '$questionId',
            subjectId: { $first: '$subjectId' },
            title: { $first: '$title' },
            state: { $first: '$state' },
            isQuestionAuthor: { $max: '$isQuestionAuthor' },
            ownVisibleAnswersCount: { $sum: '$ownVisibleAnswersCount' },
            lastActivityAt: { $max: '$lastActivityAt' },
          },
        },
        {
          $project: {
            _id: 0,
            questionId: '$_id',
            subjectId: 1,
            title: 1,
            state: 1,
            isQuestionAuthor: 1,
            ownVisibleAnswersCount: 1,
            lastActivityAt: 1,
          },
        },
        { $sort: { lastActivityAt: -1, questionId: 1 } },
        { $limit: QA_DISCUSSIONS_PREVIEW_LIMIT + 1 },
      ])
      .option({ maxTimeMS: MONGO_MAX_TIME_MS })
      .exec();

    if (rows.length > QA_DISCUSSIONS_PREVIEW_LIMIT + 1) {
      invalidAggregate();
    }

    const seen = new Set<string>();
    const items = rows.map((row) => {
      const item = readItem(row);
      if (seen.has(item.questionId)) invalidAggregate();
      seen.add(item.questionId);
      return item;
    });

    return {
      items: items.slice(0, QA_DISCUSSIONS_PREVIEW_LIMIT),
      hasMore: items.length > QA_DISCUSSIONS_PREVIEW_LIMIT,
    };
  }
}
