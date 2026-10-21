import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import { Answer, Question } from '../qa/mongo/qa.mongo-schemas';

export const QA_ACTIVITY_CALENDAR_DAYS = 28;
const MONGO_MAX_TIME_MS = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;
const UTC_DAY_FORMAT = '%Y-%m-%d';

interface DailyAggregateRow {
  day: unknown;
  count: unknown;
}

export interface QaCalendarDay {
  dateUtc: string;
  questions: number;
  answers: number;
  total: number;
}

export interface QaActivityCalendar {
  asOfUtc: string;
  windowStartUtc: string;
  windowEndUtcExclusive: string;
  days: QaCalendarDay[];
}

function unavailable(): never {
  throw new ServiceUnavailableException({
    code: 'QA_ACTIVITY_CALENDAR_UNAVAILABLE',
    message: 'Q&A activity calendar is temporarily unavailable',
  });
}

function applyCounts(
  rows: DailyAggregateRow[],
  allowedDays: Map<string, QaCalendarDay>,
  field: 'questions' | 'answers',
): void {
  if (!Array.isArray(rows) || rows.length > QA_ACTIVITY_CALENDAR_DAYS) {
    unavailable();
  }

  const seen = new Set<string>();
  for (const row of rows) {
    if (
      typeof row !== 'object' ||
      row === null ||
      typeof row.day !== 'string' ||
      !allowedDays.has(row.day) ||
      seen.has(row.day) ||
      typeof row.count !== 'number' ||
      !Number.isSafeInteger(row.count) ||
      row.count < 0
    ) {
      unavailable();
    }

    const day = allowedDays.get(row.day);
    if (!day) unavailable();
    day[field] = row.count;
    seen.add(row.day);
  }
}

@Injectable()
export class QaActivityCalendarService {
  constructor(
    @InjectModel(Question.name)
    private readonly questions: Model<Question>,
    @InjectModel(Answer.name)
    private readonly answers: Model<Answer>,
  ) {}

  async forOwner(
    ownerUserId: string,
    now: Date = new Date(),
  ): Promise<QaActivityCalendar> {
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      unavailable();
    }

    // Use a single request clock so midnight cannot split the two queries.
    // UTC day buckets make interpretation deterministic across clients.
    const end = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    );
    const start = new Date(end.getTime() - QA_ACTIVITY_CALENDAR_DAYS * DAY_MS);
    const dayExpression = {
      $dateToString: {
        format: UTC_DAY_FORMAT,
        date: '$createdAt',
        timezone: 'UTC',
      },
    };

    const [questionRows, answerRows] = await Promise.all([
      this.questions
        .aggregate<DailyAggregateRow>([
          {
            $match: {
              authorUserId: ownerUserId,
              moderationState: 'available',
              state: { $in: ['open', 'closed'] },
              createdAt: { $gte: start, $lt: end },
            },
          },
          {
            $group: {
              _id: dayExpression,
              count: { $sum: 1 },
            },
          },
          { $project: { _id: 0, day: '$_id', count: 1 } },
          { $sort: { day: 1 } },
          { $limit: QA_ACTIVITY_CALENDAR_DAYS + 1 },
        ])
        .option({ maxTimeMS: MONGO_MAX_TIME_MS })
        .exec(),
      this.answers
        .aggregate<DailyAggregateRow>([
          {
            $match: {
              authorUserId: ownerUserId,
              moderationState: 'available',
              createdAt: { $gte: start, $lt: end },
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
                { $project: { _id: 1 } },
                { $limit: 1 },
              ],
              as: 'visibleParent',
            },
          },
          { $unwind: '$visibleParent' },
          {
            $group: {
              _id: dayExpression,
              count: { $sum: 1 },
            },
          },
          { $project: { _id: 0, day: '$_id', count: 1 } },
          { $sort: { day: 1 } },
          { $limit: QA_ACTIVITY_CALENDAR_DAYS + 1 },
        ])
        .option({ maxTimeMS: MONGO_MAX_TIME_MS })
        .exec(),
    ]);

    const days: QaCalendarDay[] = Array.from(
      { length: QA_ACTIVITY_CALENDAR_DAYS },
      (_, index) => ({
        dateUtc: new Date(start.getTime() + index * DAY_MS)
          .toISOString()
          .slice(0, 10),
        questions: 0,
        answers: 0,
        total: 0,
      }),
    );
    const allowedDays = new Map(days.map((day) => [day.dateUtc, day]));

    applyCounts(questionRows, allowedDays, 'questions');
    applyCounts(answerRows, allowedDays, 'answers');
    for (const day of days) {
      if (!Number.isSafeInteger(day.questions + day.answers)) {
        unavailable();
      }
      day.total = day.questions + day.answers;
    }

    return {
      asOfUtc: now.toISOString(),
      windowStartUtc: start.toISOString(),
      windowEndUtcExclusive: end.toISOString(),
      days,
    };
  }
}
