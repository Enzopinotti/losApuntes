import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import { Question } from '../qa/mongo/qa.mongo-schemas';

export const QA_FOLLOW_UP_PAGE_SIZE = 5;
const MONGO_MAX_TIME_MS = 5000;

export interface QaFollowUpItem {
  questionId: string;
  subjectId: string;
  title: string;
  updatedAt: string;
}

export interface QaFollowUpLane {
  items: QaFollowUpItem[];
  hasMore: boolean;
}

export interface QaFollowUpInbox {
  needsReview: QaFollowUpLane;
  awaitingReplies: QaFollowUpLane;
}

function invalidAggregate(): never {
  throw new ServiceUnavailableException({
    code: 'QA_FOLLOW_UPS_UNAVAILABLE',
    message: 'Q&A follow-ups are temporarily unavailable',
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

function readLane(
  value: unknown,
  expectedVisibleAnswer: boolean,
  seen: Set<string>,
): QaFollowUpLane {
  if (!Array.isArray(value) || value.length > QA_FOLLOW_UP_PAGE_SIZE + 1) {
    invalidAggregate();
  }

  const parsed: QaFollowUpItem[] = value.map((untrusted: unknown) => {
    if (
      typeof untrusted !== 'object' ||
      untrusted === null ||
      Array.isArray(untrusted)
    ) {
      invalidAggregate();
    }
    const row = untrusted as Record<string, unknown>;
    if (
      !validIdentifier(row.id) ||
      !validIdentifier(row.subjectId) ||
      typeof row.title !== 'string' ||
      row.title.trim().length === 0 ||
      row.title.length > 1024 ||
      !(row.updatedAt instanceof Date) ||
      Number.isNaN(row.updatedAt.getTime()) ||
      row.hasVisibleAnswer !== expectedVisibleAnswer ||
      seen.has(row.id)
    ) {
      invalidAggregate();
    }
    seen.add(row.id);
    return {
      questionId: row.id,
      subjectId: row.subjectId,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
    };
  });

  return {
    items: parsed.slice(0, QA_FOLLOW_UP_PAGE_SIZE),
    hasMore: parsed.length > QA_FOLLOW_UP_PAGE_SIZE,
  };
}

@Injectable()
export class QaFollowUpsService {
  constructor(
    @InjectModel(Question.name)
    private readonly questions: Model<Question>,
  ) {}

  async forOwner(ownerUserId: string): Promise<QaFollowUpInbox> {
    // A stored answerCount includes moderated answers; only the existence of
    // an *available* answer can move a question into the review lane.
    // Both lanes are computed from one server-side aggregation and never
    // return the answer bodies, authors or moderation metadata.
    const rows = await this.questions
      .aggregate<Record<string, unknown>>([
        {
          $match: {
            authorUserId: ownerUserId,
            moderationState: 'available',
            state: 'open',
            acceptedAnswerId: null,
          },
        },
        { $sort: { updatedAt: -1, id: 1 } },
        {
          $lookup: {
            from: 'answers',
            let: { questionId: '$id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$questionId', '$$questionId'] },
                  moderationState: 'available',
                },
              },
              { $project: { _id: 1 } },
              { $limit: 1 },
            ],
            as: 'visibleAnswers',
          },
        },
        {
          $addFields: {
            hasVisibleAnswer: {
              $gt: [{ $size: '$visibleAnswers' }, 0],
            },
          },
        },
        {
          $project: {
            _id: 0,
            id: 1,
            subjectId: 1,
            title: 1,
            updatedAt: 1,
            hasVisibleAnswer: 1,
          },
        },
        {
          $facet: {
            needsReview: [
              { $match: { hasVisibleAnswer: true } },
              { $limit: QA_FOLLOW_UP_PAGE_SIZE + 1 },
            ],
            awaitingReplies: [
              { $match: { hasVisibleAnswer: false } },
              { $limit: QA_FOLLOW_UP_PAGE_SIZE + 1 },
            ],
          },
        },
      ])
      .option({ maxTimeMS: MONGO_MAX_TIME_MS })
      .exec();

    if (rows.length !== 1) invalidAggregate();
    const row = rows[0];
    if (!row) invalidAggregate();

    const seen = new Set<string>();
    return {
      needsReview: readLane(row.needsReview, true, seen),
      awaitingReplies: readLane(row.awaitingReplies, false, seen),
    };
  }
}
