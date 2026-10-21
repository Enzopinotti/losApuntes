import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, PipelineStage } from 'mongoose';

import { Question } from '../qa/mongo/qa.mongo-schemas';
import { QA_CARD_STATUS_MAX_IDS } from './qa-card-status.dto';

const MONGO_MAX_TIME_MS = 5000;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export interface QaCardStatus {
  questionId: string;
  subjectId: string;
  state: 'open' | 'closed';
  isOwnQuestion: boolean;
  hasVisibleAnswer: boolean;
  hasAcceptedVisibleAnswer: boolean;
}

export interface QaCardStatusBatch {
  items: QaCardStatus[];
}

interface CardStatusRow {
  questionId: unknown;
  subjectId: unknown;
  state: unknown;
  isOwnQuestion: unknown;
  hasVisibleAnswer: unknown;
  hasAcceptedVisibleAnswer: unknown;
}

function invalidRequest(): never {
  throw new BadRequestException({
    code: 'QA_CARD_STATUS_INPUT_INVALID',
    message: 'Provide between 1 and 20 unique canonical question UUIDs',
  });
}

function unavailable(): never {
  throw new ServiceUnavailableException({
    code: 'QA_CARD_STATUS_UNAVAILABLE',
    message: 'Q&A card status is temporarily unavailable',
  });
}

function validateIds(input: unknown): string[] {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).length !== 1
  ) {
    invalidRequest();
  }
  const questionIds = (input as Record<string, unknown>).questionIds;
  if (
    !Array.isArray(questionIds) ||
    questionIds.length < 1 ||
    questionIds.length > QA_CARD_STATUS_MAX_IDS ||
    !questionIds.every(
      (id: unknown) => typeof id === 'string' && UUID_V4.test(id),
    ) ||
    new Set(questionIds).size !== questionIds.length
  ) {
    invalidRequest();
  }
  return questionIds as string[];
}

function readCard(row: CardStatusRow): QaCardStatus {
  if (
    !row ||
    typeof row !== 'object' ||
    typeof row.questionId !== 'string' ||
    !UUID_V4.test(row.questionId) ||
    typeof row.subjectId !== 'string' ||
    !UUID_V4.test(row.subjectId) ||
    (row.state !== 'open' && row.state !== 'closed') ||
    typeof row.isOwnQuestion !== 'boolean' ||
    typeof row.hasVisibleAnswer !== 'boolean' ||
    typeof row.hasAcceptedVisibleAnswer !== 'boolean' ||
    (row.hasAcceptedVisibleAnswer && !row.hasVisibleAnswer)
  ) {
    unavailable();
  }

  return {
    questionId: row.questionId,
    subjectId: row.subjectId,
    state: row.state,
    isOwnQuestion: row.isOwnQuestion,
    hasVisibleAnswer: row.hasVisibleAnswer,
    hasAcceptedVisibleAnswer: row.hasAcceptedVisibleAnswer,
  };
}

@Injectable()
export class QaCardStatusService {
  constructor(
    @InjectModel(Question.name)
    private readonly questions: Model<Question>,
  ) {}

  async forViewer(
    viewerUserId: string,
    input: unknown,
  ): Promise<QaCardStatusBatch> {
    const questionIds = validateIds(input);

    // A maximum of twenty indexed, available parent Questions are considered
    // before either bounded Answer existence lookup. Missing or moderated
    // parents are omitted altogether, as they are in the public Q&A detail.
    const pipeline: PipelineStage[] = [
      {
        $match: {
          id: { $in: questionIds },
          moderationState: 'available',
          state: { $in: ['open', 'closed'] },
        },
      },
      { $limit: QA_CARD_STATUS_MAX_IDS },
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
      {
        $lookup: {
          from: 'answers',
          let: { parentId: '$id', acceptedId: '$acceptedAnswerId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $ne: ['$$acceptedId', null] },
                    { $eq: ['$questionId', '$$parentId'] },
                    { $eq: ['$id', '$$acceptedId'] },
                  ],
                },
                moderationState: 'available',
              },
            },
            { $project: { _id: 1 } },
            { $limit: 1 },
          ],
          as: 'acceptedVisible',
        },
      },
      {
        $project: {
          _id: 0,
          questionId: '$id',
          subjectId: 1,
          state: 1,
          isOwnQuestion: { $eq: ['$authorUserId', viewerUserId] },
          hasVisibleAnswer: {
            $gt: [{ $size: '$visibleAnswers' }, 0],
          },
          hasAcceptedVisibleAnswer: {
            $gt: [{ $size: '$acceptedVisible' }, 0],
          },
        },
      },
    ];

    const rows = await this.questions
      .aggregate<CardStatusRow>(pipeline)
      .option({ maxTimeMS: MONGO_MAX_TIME_MS })
      .exec();

    if (!Array.isArray(rows) || rows.length > questionIds.length) {
      unavailable();
    }

    const requested = new Set(questionIds);
    const found = new Map<string, QaCardStatus>();
    for (const row of rows) {
      const card = readCard(row);
      if (!requested.has(card.questionId) || found.has(card.questionId)) {
        unavailable();
      }
      found.set(card.questionId, card);
    }

    // Mongo $in does not guarantee input order. Never expose hidden/missing
    // question IDs as individual status records; simply omit them.
    return {
      items: questionIds.flatMap((id) => {
        const card = found.get(id);
        return card ? [card] : [];
      }),
    };
  }
}
