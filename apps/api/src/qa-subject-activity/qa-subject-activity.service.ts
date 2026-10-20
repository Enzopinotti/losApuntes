import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import { Question } from '../qa/mongo/qa.mongo-schemas';

export const QA_SUBJECT_ACTIVITY_PAGE_SIZE = 20;
const QUERY_MAX_TIME_MS = 5000;

export interface QaSubjectActivityItem {
  subjectId: string;
  questionsTotal: number;
  questionsOpen: number;
  questionsClosed: number;
  answersVisible: number;
  answersAccepted: number;
  totalActivity: number;
}

export interface QaSubjectActivityPage {
  items: QaSubjectActivityItem[];
  hasMore: boolean;
}

interface AggregateRow {
  subjectId: unknown;
  questionsOpen: unknown;
  questionsClosed: unknown;
  answersVisible: unknown;
  answersAccepted: unknown;
  totalActivity: unknown;
}

function invalidStoredActivity(): never {
  throw new ServiceUnavailableException({
    code: 'QA_SUBJECT_ACTIVITY_UNAVAILABLE',
    message: 'Q&A subject activity is temporarily unavailable',
  });
}

function nonnegativeCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    invalidStoredActivity();
  }
  return value;
}

function toItem(row: AggregateRow): QaSubjectActivityItem {
  if (
    typeof row.subjectId !== 'string' ||
    row.subjectId.length === 0 ||
    row.subjectId.length > 128 ||
    row.subjectId.trim() !== row.subjectId
  ) {
    invalidStoredActivity();
  }

  const questionsOpen = nonnegativeCount(row.questionsOpen);
  const questionsClosed = nonnegativeCount(row.questionsClosed);
  const answersVisible = nonnegativeCount(row.answersVisible);
  const answersAccepted = nonnegativeCount(row.answersAccepted);
  const totalActivity = nonnegativeCount(row.totalActivity);
  const questionsTotal = questionsOpen + questionsClosed;

  if (
    !Number.isSafeInteger(questionsTotal) ||
    !Number.isSafeInteger(questionsTotal + answersVisible) ||
    answersAccepted > answersVisible ||
    totalActivity !== questionsTotal + answersVisible
  ) {
    invalidStoredActivity();
  }

  return {
    subjectId: row.subjectId,
    questionsTotal,
    questionsOpen,
    questionsClosed,
    answersVisible,
    answersAccepted,
    totalActivity,
  };
}

@Injectable()
export class QaSubjectActivityService {
  constructor(
    @InjectModel(Question.name)
    private readonly questions: Model<Question>,
  ) {}

  async forOwner(ownerUserId: string): Promise<QaSubjectActivityPage> {
    // $unionWith is intentionally a single server-side pipeline. Limiting
    // the question and answer branches separately would lose top subjects
    // that have medium contributions in both branches.
    const rows = await this.questions
      .aggregate<AggregateRow>([
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
            subjectId: 1,
            questionsOpen: {
              $cond: [{ $eq: ['$state', 'open'] }, 1, 0],
            },
            questionsClosed: {
              $cond: [{ $eq: ['$state', 'closed'] }, 1, 0],
            },
            answersVisible: { $literal: 0 },
            answersAccepted: { $literal: 0 },
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
                        subjectId: 1,
                        acceptedAnswerId: 1,
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
                  subjectId: '$visibleQuestion.subjectId',
                  questionsOpen: { $literal: 0 },
                  questionsClosed: { $literal: 0 },
                  answersVisible: { $literal: 1 },
                  answersAccepted: {
                    $cond: [
                      { $eq: ['$id', '$visibleQuestion.acceptedAnswerId'] },
                      1,
                      0,
                    ],
                  },
                },
              },
            ],
          },
        },
        {
          $group: {
            _id: '$subjectId',
            questionsOpen: { $sum: '$questionsOpen' },
            questionsClosed: { $sum: '$questionsClosed' },
            answersVisible: { $sum: '$answersVisible' },
            answersAccepted: { $sum: '$answersAccepted' },
          },
        },
        {
          $project: {
            _id: 0,
            subjectId: '$_id',
            questionsOpen: 1,
            questionsClosed: 1,
            answersVisible: 1,
            answersAccepted: 1,
            totalActivity: {
              $add: ['$questionsOpen', '$questionsClosed', '$answersVisible'],
            },
          },
        },
        { $sort: { totalActivity: -1, subjectId: 1 } },
        { $limit: QA_SUBJECT_ACTIVITY_PAGE_SIZE + 1 },
      ])
      .option({ maxTimeMS: QUERY_MAX_TIME_MS })
      .exec();

    if (rows.length > QA_SUBJECT_ACTIVITY_PAGE_SIZE + 1) {
      invalidStoredActivity();
    }

    const seen = new Set<string>();
    const items = rows.map(toItem);
    for (const item of items) {
      if (seen.has(item.subjectId)) invalidStoredActivity();
      seen.add(item.subjectId);
    }

    return {
      items: items.slice(0, QA_SUBJECT_ACTIVITY_PAGE_SIZE),
      hasMore: items.length > QA_SUBJECT_ACTIVITY_PAGE_SIZE,
    };
  }
}
