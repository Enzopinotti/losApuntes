import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, PipelineStage } from 'mongoose';

import { Question } from '../qa/mongo/qa.mongo-schemas';
import {
  decodeReceivedRepliesCursor,
  encodeReceivedRepliesCursor,
  isReceivedReplyAnswerId,
} from './received-replies-cursor';

export const RECEIVED_REPLIES_LIMIT = 10;
const MONGO_MAX_TIME_MS = 5000;

export interface ReceivedReplyItem {
  answerId: string;
  questionId: string;
  subjectId: string;
  questionTitle: string;
  answeredAt: string;
  isAccepted: boolean;
}

export interface ReceivedRepliesPage {
  items: ReceivedReplyItem[];
  nextCursor: string | null;
}

interface StoredReplyRow {
  answerId: unknown;
  questionId: unknown;
  subjectId: unknown;
  questionTitle: unknown;
  answeredAt: unknown;
  isAccepted: unknown;
}

function corruptReply(): never {
  throw new ServiceUnavailableException({
    code: 'QA_RECEIVED_REPLIES_UNAVAILABLE',
    message: 'Received replies are temporarily unavailable',
  });
}

function nonblankId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    value.trim() === value
  );
}

function readRow(row: StoredReplyRow): ReceivedReplyItem {
  if (
    !isReceivedReplyAnswerId(row.answerId) ||
    !nonblankId(row.questionId) ||
    !nonblankId(row.subjectId) ||
    typeof row.questionTitle !== 'string' ||
    row.questionTitle.trim().length === 0 ||
    row.questionTitle.length > 2048 ||
    !(row.answeredAt instanceof Date) ||
    Number.isNaN(row.answeredAt.getTime()) ||
    typeof row.isAccepted !== 'boolean'
  ) {
    corruptReply();
  }
  return {
    answerId: row.answerId,
    questionId: row.questionId,
    subjectId: row.subjectId,
    questionTitle: row.questionTitle,
    answeredAt: row.answeredAt.toISOString(),
    isAccepted: row.isAccepted,
  };
}

@Injectable()
export class ReceivedRepliesService {
  constructor(
    @InjectModel(Question.name)
    private readonly questions: Model<Question>,
  ) {}

  async forOwner(
    ownerUserId: string,
    rawCursor: unknown,
  ): Promise<ReceivedRepliesPage> {
    const cursor = decodeReceivedRepliesCursor(rawCursor, ownerUserId);

    // Bound each parent join at pageSize+1 AFTER applying the keyset.
    // Without this cap, a high-volume question could materialize an
    // unbounded Mongo lookup array even though the final output is small.
    const answerLookup: PipelineStage[] = [
      {
        $match: {
          $expr: { $eq: ['$questionId', '$questionId'] },
          moderationState: 'available',
        },
      },
    ];
    if (cursor) {
      answerLookup.push({
        $match: {
          $or: [
            { createdAt: { $lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { $gt: cursor.id } },
          ],
        },
      });
    }
    answerLookup.push(
      { $sort: { createdAt: -1, id: 1 } },
      { $limit: RECEIVED_REPLIES_LIMIT + 1 },
      { $project: { _id: 0, id: 1, createdAt: 1 } },
    );

    // Begin with visible questions owned by this session, not with
    // globally visible answers. Hidden parents and answers never appear.
    const pipeline: PipelineStage[] = [
      {
        $match: {
          authorUserId: ownerUserId,
          moderationState: 'available',
          state: { $in: ['open', 'closed'] },
        },
      },
      {
        $lookup: {
          from: 'answers',
          let: { questionId: '$id' },
          pipeline: answerLookup,
          as: 'visibleReplies',
        },
      },
      { $unwind: '$visibleReplies' },
    ];

    pipeline.push(
      {
        $project: {
          _id: 0,
          answerId: '$visibleReplies.id',
          questionId: '$id',
          subjectId: 1,
          questionTitle: '$title',
          answeredAt: '$visibleReplies.createdAt',
          isAccepted: { $eq: ['$acceptedAnswerId', '$visibleReplies.id'] },
        },
      },
      { $sort: { answeredAt: -1, answerId: 1 } },
      { $limit: RECEIVED_REPLIES_LIMIT + 1 },
    );

    const rows = await this.questions
      .aggregate<StoredReplyRow>(pipeline)
      .option({ maxTimeMS: MONGO_MAX_TIME_MS })
      .exec();

    if (rows.length > RECEIVED_REPLIES_LIMIT + 1) corruptReply();

    const seen = new Set<string>();
    const items = rows.map((row) => {
      const item = readRow(row);
      if (seen.has(item.answerId)) corruptReply();
      seen.add(item.answerId);
      return item;
    });

    const page = items.slice(0, RECEIVED_REPLIES_LIMIT);
    const last = page.at(-1);
    return {
      items: page,
      nextCursor:
        items.length > RECEIVED_REPLIES_LIMIT && last
          ? encodeReceivedRepliesCursor(
              { createdAt: new Date(last.answeredAt), id: last.answerId },
              ownerUserId,
            )
          : null,
    };
  }
}
