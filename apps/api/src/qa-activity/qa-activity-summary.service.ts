import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import { Answer, Question } from '../qa/mongo/qa.mongo-schemas';

export interface QaActivitySummary {
  questionsTotal: number;
  questionsOpen: number;
  questionsClosed: number;
  questionsOpenWithoutAcceptedAnswer: number;
  answersVisible: number;
  answersAccepted: number;
}

type QuestionTotals = Pick<
  QaActivitySummary,
  | 'questionsTotal'
  | 'questionsOpen'
  | 'questionsClosed'
  | 'questionsOpenWithoutAcceptedAnswer'
>;
type AnswerTotals = Pick<
  QaActivitySummary,
  'answersVisible' | 'answersAccepted'
>;

function invalidStoredSummary(): never {
  throw new ServiceUnavailableException({
    code: 'QA_ACTIVITY_SUMMARY_UNAVAILABLE',
    message: 'Q&A activity summary is temporarily unavailable',
  });
}

function finiteCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    invalidStoredSummary();
  }
  return value;
}

function readQuestionTotals(rows: QuestionTotals[]): QuestionTotals {
  if (rows.length === 0) {
    return {
      questionsTotal: 0,
      questionsOpen: 0,
      questionsClosed: 0,
      questionsOpenWithoutAcceptedAnswer: 0,
    };
  }
  if (rows.length !== 1) invalidStoredSummary();
  const first = rows[0];
  if (!first) invalidStoredSummary();
  const totals: QuestionTotals = {
    questionsTotal: finiteCount(first.questionsTotal),
    questionsOpen: finiteCount(first.questionsOpen),
    questionsClosed: finiteCount(first.questionsClosed),
    questionsOpenWithoutAcceptedAnswer: finiteCount(
      first.questionsOpenWithoutAcceptedAnswer,
    ),
  };
  if (
    totals.questionsTotal !== totals.questionsOpen + totals.questionsClosed ||
    totals.questionsOpenWithoutAcceptedAnswer > totals.questionsOpen
  ) {
    invalidStoredSummary();
  }
  return totals;
}

function readAnswerTotals(rows: AnswerTotals[]): AnswerTotals {
  if (rows.length === 0) return { answersVisible: 0, answersAccepted: 0 };
  if (rows.length !== 1) invalidStoredSummary();
  const first = rows[0];
  if (!first) invalidStoredSummary();
  const totals = {
    answersVisible: finiteCount(first.answersVisible),
    answersAccepted: finiteCount(first.answersAccepted),
  };
  if (totals.answersAccepted > totals.answersVisible) invalidStoredSummary();
  return totals;
}

@Injectable()
export class QaActivitySummaryService {
  constructor(
    @InjectModel(Question.name)
    private readonly questions: Model<Question>,
    @InjectModel(Answer.name)
    private readonly answers: Model<Answer>,
  ) {}

  async forOwner(ownerUserId: string): Promise<QaActivitySummary> {
    // Aggregate on the owner in Mongo: no raw content or unbounded document
    // lists are transferred to the API. Public moderation rules also apply
    // to the owner-facing summary.
    const [questionRows, answerRows] = await Promise.all([
      this.questions
        .aggregate<QuestionTotals>([
          {
            $match: {
              authorUserId: ownerUserId,
              moderationState: 'available',
              state: { $in: ['open', 'closed'] },
            },
          },
          {
            $group: {
              _id: null,
              questionsTotal: { $sum: 1 },
              questionsOpen: {
                $sum: { $cond: [{ $eq: ['$state', 'open'] }, 1, 0] },
              },
              questionsClosed: {
                $sum: { $cond: [{ $eq: ['$state', 'closed'] }, 1, 0] },
              },
              questionsOpenWithoutAcceptedAnswer: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$state', 'open'] },
                        { $eq: ['$acceptedAnswerId', null] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ])
        .option({ maxTimeMS: 5000 })
        .exec(),
      this.answers
        .aggregate<AnswerTotals>([
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
                { $project: { _id: 0, acceptedAnswerId: 1 } },
                { $limit: 1 },
              ],
              as: 'visibleQuestion',
            },
          },
          { $unwind: '$visibleQuestion' },
          {
            $group: {
              _id: null,
              answersVisible: { $sum: 1 },
              answersAccepted: {
                $sum: {
                  $cond: [
                    { $eq: ['$visibleQuestion.acceptedAnswerId', '$id'] },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ])
        .option({ maxTimeMS: 5000 })
        .exec(),
    ]);

    return {
      ...readQuestionTotals(questionRows),
      ...readAnswerTotals(answerRows),
    };
  }
}
