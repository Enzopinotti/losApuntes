import {
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, PipelineStage } from 'mongoose';

import { Answer } from '../mongo/qa.mongo-schemas';
import {
  decodeMyAnswersCursor,
  encodeMyAnswersCursor,
} from './qa-my-answers.cursor';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export const MY_ANSWERS_PAGE_LIMIT = 25;

interface VisibleAnswerRow {
  id: string;
  questionId: string;
  body: string;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  question: {
    id: string;
    subjectId: string;
    title: string;
    state: 'open' | 'closed';
    acceptedAnswerId: string | null;
  };
}

function unavailable(): never {
  throw new ServiceUnavailableException({
    code: 'QA_MY_ANSWERS_DATA_INVALID',
    message: 'My answers data could not be read safely',
  });
}

/**
 * An answer written by the actor is still invisible when its question or the
 * answer itself is moderated. The Mongo lookup enforces both visibility
 * predicates BEFORE the limit, so pages contain only eligible answers.
 */
@Injectable()
export class QaMyAnswersService {
  constructor(
    @InjectModel(Answer.name)
    private readonly answers: Model<Answer>,
  ) {}

  async list(ownerUserId: string, input: { limit: number; cursor?: string }) {
    if (!ownerUserId || !ownerUserId.trim()) {
      throw new UnprocessableEntityException({
        code: 'QA_MY_ANSWERS_OWNER_REQUIRED',
        message: 'An authenticated account is required',
      });
    }
    if (
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > MY_ANSWERS_PAGE_LIMIT
    ) {
      throw new UnprocessableEntityException({
        code: 'QA_MY_ANSWERS_LIMIT_INVALID',
        message: 'Page size must be between 1 and 25',
      });
    }

    const after = decodeMyAnswersCursor(ownerUserId, input.cursor);
    const pipeline: PipelineStage[] = [
      {
        $match: {
          authorUserId: ownerUserId,
          moderationState: 'available',
          ...(after
            ? {
                $or: [
                  { createdAt: { $lt: after.createdAt } },
                  {
                    createdAt: after.createdAt,
                    id: { $gt: after.id },
                  },
                ],
              }
            : {}),
        },
      },
      { $sort: { createdAt: -1, id: 1 } },
      {
        $lookup: {
          from: 'questions',
          localField: 'questionId',
          foreignField: 'id',
          as: 'question',
          pipeline: [
            { $match: { moderationState: 'available' } },
            {
              $project: {
                _id: 0,
                id: 1,
                subjectId: 1,
                title: 1,
                state: 1,
                acceptedAnswerId: 1,
              },
            },
          ],
        },
      },
      // Missing/hidden parent => no answer, even for the answer's author.
      { $unwind: '$question' },
      { $limit: input.limit + 1 },
      {
        $project: {
          _id: 0,
          id: 1,
          questionId: 1,
          body: 1,
          revision: 1,
          createdAt: 1,
          updatedAt: 1,
          question: 1,
        },
      },
    ];
    const rows = await this.answers
      .aggregate<VisibleAnswerRow>(pipeline)
      .exec();
    if (!Array.isArray(rows) || rows.length > input.limit + 1) {
      return unavailable();
    }

    const page = rows.slice(0, input.limit);
    for (const row of page) {
      if (
        !row ||
        !UUID_V4.test(row.id) ||
        !UUID_V4.test(row.questionId) ||
        typeof row.body !== 'string' ||
        !Number.isSafeInteger(row.revision) ||
        row.revision < 1 ||
        !(row.createdAt instanceof Date) ||
        !Number.isFinite(row.createdAt.getTime()) ||
        !(row.updatedAt instanceof Date) ||
        !Number.isFinite(row.updatedAt.getTime()) ||
        !row.question ||
        row.question.id !== row.questionId ||
        !UUID_V4.test(row.question.subjectId) ||
        typeof row.question.title !== 'string' ||
        (row.question.state !== 'open' && row.question.state !== 'closed')
      ) {
        return unavailable();
      }
    }

    const last = page.at(-1);
    return {
      items: page.map((row) => ({
        id: row.id,
        question: {
          id: row.question.id,
          subjectId: row.question.subjectId,
          title: row.question.title,
          state: row.question.state,
        },
        body: row.body,
        revision: row.revision,
        accepted: row.question.acceptedAnswerId === row.id,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      nextCursor:
        rows.length > input.limit && last
          ? encodeMyAnswersCursor(ownerUserId, {
              id: last.id,
              createdAt: last.createdAt,
            })
          : null,
    };
  }
}
