import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, PipelineStage } from 'mongoose';

import { AcademicService } from '../academic/domain/academic.service';
import { Question } from '../qa/mongo/qa.mongo-schemas';
import {
  decodeSolvedQaCursor,
  encodeSolvedQaCursor,
} from './qa-solved-library.cursor';

export const QA_SOLVED_LIBRARY_PAGE_SIZE = 15;
const MONGO_MAX_TIME_MS = 5000;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export interface SolvedQaCard {
  questionId: string;
  subjectId: string;
  title: string;
  createdAt: string;
  acceptedAnswerId: string;
}

export interface SolvedQaPage {
  items: SolvedQaCard[];
  nextCursor: string | null;
}

interface SolvedQuestionRow {
  questionId: unknown;
  subjectId: unknown;
  title: unknown;
  createdAt: unknown;
  acceptedAnswerId: unknown;
}

function unavailable(): never {
  throw new ServiceUnavailableException({
    code: 'QA_SOLVED_LIBRARY_UNAVAILABLE',
    message: 'Solved questions are temporarily unavailable',
  });
}

function readCard(row: SolvedQuestionRow): SolvedQaCard {
  if (
    !row ||
    typeof row !== 'object' ||
    typeof row.questionId !== 'string' ||
    !UUID_V4.test(row.questionId) ||
    typeof row.subjectId !== 'string' ||
    !UUID_V4.test(row.subjectId) ||
    typeof row.acceptedAnswerId !== 'string' ||
    !UUID_V4.test(row.acceptedAnswerId) ||
    typeof row.title !== 'string' ||
    row.title.trim().length === 0 ||
    row.title.length > 180 ||
    !(row.createdAt instanceof Date) ||
    Number.isNaN(row.createdAt.getTime())
  ) {
    unavailable();
  }

  return {
    questionId: row.questionId,
    subjectId: row.subjectId,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    acceptedAnswerId: row.acceptedAnswerId,
  };
}

@Injectable()
export class QaSolvedLibraryService {
  constructor(
    @InjectModel(Question.name)
    private readonly questions: Model<Question>,
    private readonly academic: AcademicService,
  ) {}

  async forSubject(
    viewerUserId: string,
    rawSubjectId: string,
    rawCursor: unknown,
  ): Promise<SolvedQaPage> {
    const { subjectId } =
      await this.academic.resolveResourceContext(rawSubjectId);
    const cursor = decodeSolvedQaCursor(rawCursor, subjectId, viewerUserId);

    const match: Record<string, unknown> = {
      subjectId,
      moderationState: 'available',
      state: { $in: ['open', 'closed'] },
      acceptedAnswerId: { $type: 'string' },
    };
    if (cursor) {
      match.$or = [
        { createdAt: { $lt: cursor.createdAt } },
        {
          createdAt: cursor.createdAt,
          id: { $gt: cursor.questionId },
        },
      ];
    }

    // Verify the accepted Answer belongs to this Question and is available.
    // An acceptedAnswerId pointer alone can refer to hidden or stale content.
    const pipeline: PipelineStage[] = [
      { $match: match },
      { $sort: { createdAt: -1, id: 1 } },
      {
        $lookup: {
          from: 'answers',
          let: { questionId: '$id', acceptedId: '$acceptedAnswerId' },
          pipeline: [
            {
              $match: {
                moderationState: 'available',
                $expr: {
                  $and: [
                    { $eq: ['$questionId', '$$questionId'] },
                    { $eq: ['$id', '$$acceptedId'] },
                  ],
                },
              },
            },
            { $project: { _id: 0, id: 1 } },
            { $limit: 1 },
          ],
          as: 'acceptedVisible',
        },
      },
      { $match: { 'acceptedVisible.0': { $exists: true } } },
      {
        $project: {
          _id: 0,
          questionId: '$id',
          subjectId: 1,
          title: 1,
          createdAt: 1,
          acceptedAnswerId: { $arrayElemAt: ['$acceptedVisible.id', 0] },
        },
      },
      { $limit: QA_SOLVED_LIBRARY_PAGE_SIZE + 1 },
    ];

    const rows = await this.questions
      .aggregate<SolvedQuestionRow>(pipeline)
      .option({ maxTimeMS: MONGO_MAX_TIME_MS })
      .exec();

    if (!Array.isArray(rows) || rows.length > QA_SOLVED_LIBRARY_PAGE_SIZE + 1) {
      unavailable();
    }

    const seen = new Set<string>();
    let previous: SolvedQaCard | undefined;
    const cards = rows.map((row) => {
      const card = readCard(row);
      if (card.subjectId !== subjectId || seen.has(card.questionId)) {
        unavailable();
      }
      if (
        previous &&
        (card.createdAt > previous.createdAt ||
          (card.createdAt === previous.createdAt &&
            card.questionId <= previous.questionId))
      ) {
        unavailable();
      }
      seen.add(card.questionId);
      previous = card;
      return card;
    });

    const items = cards.slice(0, QA_SOLVED_LIBRARY_PAGE_SIZE);
    const last = items.at(-1);

    return {
      items,
      nextCursor:
        last && cards.length > QA_SOLVED_LIBRARY_PAGE_SIZE
          ? encodeSolvedQaCursor(
              { createdAt: new Date(last.createdAt), questionId: last.questionId },
              subjectId,
              viewerUserId,
            )
          : null,
    };
  }
}
