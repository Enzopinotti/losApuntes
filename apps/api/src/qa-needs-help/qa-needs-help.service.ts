import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, PipelineStage } from 'mongoose';

import { AcademicService } from '../academic/domain/academic.service';
import { Question } from '../qa/mongo/qa.mongo-schemas';
import {
  decodeNeedsHelpCursor,
  encodeNeedsHelpCursor,
} from './qa-needs-help.cursor';

export const QA_NEEDS_HELP_LIMIT = 15;
const MONGO_MAX_TIME_MS = 5000;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export interface QaNeedsHelpCard {
  questionId: string;
  subjectId: string;
  title: string;
  createdAt: string;
}

export interface QaNeedsHelpPage {
  items: QaNeedsHelpCard[];
  nextCursor: string | null;
}

interface DbQuestion {
  questionId: unknown;
  subjectId: unknown;
  title: unknown;
  createdAt: unknown;
}

function invalidRow(): never {
  throw new ServiceUnavailableException({
    code: 'QA_NEEDS_HELP_UNAVAILABLE',
    message: 'Questions needing help are temporarily unavailable',
  });
}

function readRow(row: DbQuestion): QaNeedsHelpCard {
  if (
    !row ||
    typeof row !== 'object' ||
    typeof row.questionId !== 'string' ||
    !UUID_V4.test(row.questionId) ||
    typeof row.subjectId !== 'string' ||
    !UUID_V4.test(row.subjectId) ||
    typeof row.title !== 'string' ||
    row.title.trim().length === 0 ||
    row.title.length > 180 ||
    !(row.createdAt instanceof Date) ||
    Number.isNaN(row.createdAt.getTime())
  ) {
    invalidRow();
  }

  return {
    questionId: row.questionId,
    subjectId: row.subjectId,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class QaNeedsHelpService {
  constructor(
    @InjectModel(Question.name)
    private readonly questions: Model<Question>,
    private readonly academic: AcademicService,
  ) {}

  async forSubject(
    viewerUserId: string,
    rawSubjectId: string,
    rawCursor: unknown,
  ): Promise<QaNeedsHelpPage> {
    // Same canonical academic subject resolution as the existing Q&A search.
    const { subjectId } = await this.academic.resolveResourceContext(rawSubjectId);
    const cursor = decodeNeedsHelpCursor(rawCursor, subjectId, viewerUserId);

    const match: Record<string, unknown> = {
      subjectId,
      state: 'open',
      moderationState: 'available',
      authorUserId: { $ne: viewerUserId },
    };
    if (cursor) {
      match.$or = [
        { createdAt: { $gt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { $gt: cursor.questionId } },
      ];
    }

    // No stored answerCount: it includes hidden/moderated answers.
    // The bounded join only checks whether an available answer exists.
    const pipeline: PipelineStage[] = [
      { $match: match },
      { $sort: { createdAt: 1, id: 1 } },
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
      {
        $project: {
          _id: 0,
          questionId: '$id',
          subjectId: 1,
          title: 1,
          createdAt: 1,
        },
      },
      { $limit: QA_NEEDS_HELP_LIMIT + 1 },
    ];

    const rows = await this.questions
      .aggregate<DbQuestion>(pipeline)
      .option({ maxTimeMS: MONGO_MAX_TIME_MS })
      .exec();

    if (!Array.isArray(rows) || rows.length > QA_NEEDS_HELP_LIMIT + 1) {
      invalidRow();
    }

    const seen = new Set<string>();
    let previous: QaNeedsHelpCard | undefined;
    const items = rows.map((raw) => {
      const item = readRow(raw);
      if (item.subjectId !== subjectId || seen.has(item.questionId)) invalidRow();
      if (
        previous &&
        (item.createdAt < previous.createdAt ||
          (item.createdAt === previous.createdAt &&
            item.questionId <= previous.questionId))
      ) {
        invalidRow();
      }
      seen.add(item.questionId);
      previous = item;
      return item;
    });

    const page = items.slice(0, QA_NEEDS_HELP_LIMIT);
    const last = page.at(-1);
    return {
      items: page,
      nextCursor:
        last && items.length > QA_NEEDS_HELP_LIMIT
          ? encodeNeedsHelpCursor(
              { createdAt: new Date(last.createdAt), questionId: last.questionId },
              subjectId,
              viewerUserId,
            )
          : null,
    };
  }
}
