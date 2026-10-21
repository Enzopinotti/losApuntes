import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import { AcademicSubjectParticipation } from '../academic/mongo/academic.mongo-schemas';
import { Question } from '../qa/mongo/qa.mongo-schemas';

export const QA_HELP_SUBJECT_LIMIT = 12;
const MONGO_MAX_TIME_MS = 5000;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

interface ParticipationRow {
  subjectId: unknown;
}

interface OpportunityCountRow {
  subjectId: unknown;
  count: unknown;
}

export interface QaHelpOpportunity {
  subjectId: string;
  unansweredPeerQuestions: number;
}

export interface QaHelpOpportunities {
  items: QaHelpOpportunity[];
  hasMoreSubjects: boolean;
}

function unavailable(): never {
  throw new ServiceUnavailableException({
    code: 'QA_HELP_OPPORTUNITIES_UNAVAILABLE',
    message: 'Q&A help opportunities are temporarily unavailable',
  });
}

function isSubjectId(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4.test(value);
}

@Injectable()
export class QaHelpOpportunitiesService {
  constructor(
    @InjectModel(AcademicSubjectParticipation.name)
    private readonly participations: Model<AcademicSubjectParticipation>,
    @InjectModel(Question.name)
    private readonly questions: Model<Question>,
  ) {}

  async forOwner(ownerUserId: string): Promise<QaHelpOpportunities> {
    // Current academic participation is the sole source of subjects.
    // Group first: parallel offerings of one subject must not duplicate it.
    const participatingSubjects = await this.participations
      .aggregate<ParticipationRow>([
        { $match: { userId: ownerUserId, state: 'current' } },
        {
          $group: {
            _id: '$subjectId',
            lastParticipationUpdate: { $max: '$updatedAt' },
          },
        },
        { $sort: { lastParticipationUpdate: -1, _id: 1 } },
        { $limit: QA_HELP_SUBJECT_LIMIT + 1 },
        { $project: { _id: 0, subjectId: '$_id' } },
      ])
      .option({ maxTimeMS: MONGO_MAX_TIME_MS })
      .exec();

    if (
      !Array.isArray(participatingSubjects) ||
      participatingSubjects.length > QA_HELP_SUBJECT_LIMIT + 1
    ) {
      unavailable();
    }

    const subjects = new Set<string>();
    for (const row of participatingSubjects) {
      if (!row || !isSubjectId(row.subjectId) || subjects.has(row.subjectId)) {
        unavailable();
      }
      subjects.add(row.subjectId);
    }

    const subjectIds = [...subjects].slice(0, QA_HELP_SUBJECT_LIMIT);
    const selected = new Set(subjectIds);
    if (subjectIds.length === 0) {
      return { items: [], hasMoreSubjects: false };
    }

    // Do not use Question.answerCount: hidden answers are still counted
    // there. Each bounded lookup checks existence of an available answer.
    const rows = await this.questions
      .aggregate<OpportunityCountRow>([
        {
          $match: {
            subjectId: { $in: subjectIds },
            state: 'open',
            moderationState: 'available',
            authorUserId: { $ne: ownerUserId },
          },
        },
        {
          $lookup: {
            from: 'answers',
            let: { parentId: '$id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$questionId', '$$parentId'] },
                  moderationState: 'available',
                },
              },
              { $project: { _id: 1 } },
              { $limit: 1 },
            ],
            as: 'visibleAnswers',
          },
        },
        { $match: { 'visibleAnswers.0': { $exists: false } } },
        { $group: { _id: '$subjectId', count: { $sum: 1 } } },
        { $project: { _id: 0, subjectId: '$_id', count: 1 } },
        { $limit: QA_HELP_SUBJECT_LIMIT + 1 },
      ])
      .option({ maxTimeMS: MONGO_MAX_TIME_MS })
      .exec();

    if (!Array.isArray(rows) || rows.length > QA_HELP_SUBJECT_LIMIT) {
      unavailable();
    }

    const counts = new Map<string, number>();
    for (const row of rows) {
      if (
        !row ||
        !isSubjectId(row.subjectId) ||
        !selected.has(row.subjectId) ||
        counts.has(row.subjectId) ||
        typeof row.count !== 'number' ||
        !Number.isSafeInteger(row.count) ||
        row.count < 1
      ) {
        unavailable();
      }
      counts.set(row.subjectId, row.count);
    }

    const items = subjectIds
      .map((subjectId) => ({
        subjectId,
        unansweredPeerQuestions: counts.get(subjectId) ?? 0,
      }))
      .sort(
        (a, b) =>
          b.unansweredPeerQuestions - a.unansweredPeerQuestions ||
          a.subjectId.localeCompare(b.subjectId),
      );

    return {
      items,
      hasMoreSubjects: participatingSubjects.length > QA_HELP_SUBJECT_LIMIT,
    };
  }
}
