import {
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Model } from 'mongoose';

import { Question } from '../qa/mongo/qa.mongo-schemas';
import {
  decodeReceivedRepliesCursor,
  encodeReceivedRepliesCursor,
} from './received-replies-cursor';
import {
  ReceivedRepliesService,
  RECEIVED_REPLIES_LIMIT,
} from './received-replies.service';

const ANSWER_IDS = Array.from(
  { length: 13 },
  (_, index) =>
    '9a73b180-ef29-4489-b7c5-' + String(index + 1).padStart(12, '0'),
);

function answerRow(index: number, extra: Record<string, unknown> = {}) {
  return {
    answerId: ANSWER_IDS[index],
    questionId: 'a7f8eab6-42c8-4539-9fcd-8ce5d8794581',
    subjectId: 'a2f47be6-e403-46ac-a913-90b778a92d8c',
    questionTitle: 'How should I prepare for my final?',
    answeredAt: new Date(2026, 9, 20, 12, 0, 0, 0),
    isAccepted: index === 0,
    authorUserId: 'never-include-this',
    answerBody: 'never-include-this',
    ...extra,
  };
}

function fixture(rows: unknown[]) {
  const exec = jest.fn().mockResolvedValue(rows);
  const option = jest.fn().mockReturnValue({ exec });
  const aggregate = jest.fn<unknown, [unknown[]]>().mockReturnValue({ option });
  const service = new ReceivedRepliesService({
    aggregate,
  } as unknown as Model<Question>);
  return { service, aggregate, option, exec };
}

describe('B164 received replies feed', () => {
  it('selects owner questions before a bounded visible answers lookup', async () => {
    const { service, aggregate, option } = fixture([answerRow(0)]);
    const result = await service.forOwner('session-owner', undefined);
    expect(result).toEqual({
      items: [
        {
          answerId: ANSWER_IDS[0],
          questionId: 'a7f8eab6-42c8-4539-9fcd-8ce5d8794581',
          subjectId: 'a2f47be6-e403-46ac-a913-90b778a92d8c',
          questionTitle: 'How should I prepare for my final?',
          answeredAt: new Date(2026, 9, 20, 12).toISOString(),
          isAccepted: true,
        },
      ],
      nextCursor: null,
    });
    const pipeline = aggregate.mock.calls[0]?.[0];
    expect(pipeline?.[0]).toEqual({
      $match: {
        authorUserId: 'session-owner',
        moderationState: 'available',
        state: { $in: ['open', 'closed'] },
      },
    });
    expect(pipeline?.[1]).toEqual({
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
          { $sort: { createdAt: -1, id: 1 } },
          { $limit: 11 },
          { $project: { _id: 0, id: 1, createdAt: 1 } },
        ],
        as: 'visibleReplies',
      },
    });
    expect(pipeline?.[2]).toEqual({ $unwind: '$visibleReplies' });
    expect(pipeline?.[3]).toHaveProperty('$project');
    expect(pipeline?.[4]).toEqual({
      $sort: { answeredAt: -1, answerId: 1 },
    });
    expect(pipeline?.[5]).toEqual({ $limit: RECEIVED_REPLIES_LIMIT + 1 });
    expect(option).toHaveBeenCalledWith({ maxTimeMS: 5000 });
  });

  it('returns an empty page when no parent question has a visible reply', async () => {
    const { service } = fixture([]);
    const result = await service.forOwner('empty-account', undefined);
    expect(result).toEqual({ items: [], nextCursor: null });
  });

  it('uses 11 rows to generate a next cursor tied to the tenth visible answer', async () => {
    const { service } = fixture(
      Array.from({ length: 11 }, (_, index) => answerRow(index)),
    );
    const page = await service.forOwner('owner', undefined);
    expect(page.items).toHaveLength(10);
    expect(page.nextCursor).not.toBeNull();
    expect(decodeReceivedRepliesCursor(page.nextCursor, 'owner')).toEqual({
      createdAt: answerRow(9).answeredAt,
      id: ANSWER_IDS[9],
    });
    const crossOwner = () =>
      decodeReceivedRepliesCursor(page.nextCursor, 'other-owner');
    expect(crossOwner).toThrow(UnprocessableEntityException);
  });

  it('applies the keyset before per-question sorting and limiting', async () => {
    const { service, aggregate } = fixture([]);
    const createdAt = new Date('2026-10-19T20:00:00.000Z');
    const cursor = encodeReceivedRepliesCursor(
      { createdAt, id: ANSWER_IDS[2] },
      'owner',
    );
    await service.forOwner('owner', cursor);
    const pipeline = aggregate.mock.calls[0]?.[0];
    const lookup = pipeline?.[1] as { $lookup: { pipeline: unknown[] } };
    expect(lookup.$lookup.pipeline).toEqual([
      {
        $match: {
          $expr: { $eq: ['$questionId', '$$questionId'] },
          moderationState: 'available',
        },
      },
      {
        $match: {
          $or: [
            { createdAt: { $lt: createdAt } },
            { createdAt, id: { $gt: ANSWER_IDS[2] } },
          ],
        },
      },
      { $sort: { createdAt: -1, id: 1 } },
      { $limit: 11 },
      { $project: { _id: 0, id: 1, createdAt: 1 } },
    ]);
  });

  it.each([
    [{ answerId: 'bad-id' }],
    [{ questionId: '' }],
    [{ subjectId: ' ' }],
    [{ questionTitle: '' }],
    [{ questionTitle: 'x'.repeat(2049) }],
    [{ answeredAt: 'wrong-date' }],
    [{ answeredAt: new Date('invalid') }],
    [{ isAccepted: 'true' }],
  ])('fails closed for malformed aggregate rows', async (invalid) => {
    const { service } = fixture([answerRow(0, invalid)]);
    await expect(service.forOwner('owner', undefined)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('fails closed for duplicate answer rows and unexpected unbounded results', async () => {
    const duplicate = fixture([answerRow(0), answerRow(0)]);
    const duplicated = duplicate.service.forOwner('owner', undefined);
    await expect(duplicated).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    const excess = fixture(Array.from({ length: 12 }, (_, i) => answerRow(i)));
    const tooMany = excess.service.forOwner('owner', undefined);
    await expect(tooMany).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects malicious or cross-user cursors before querying the database', async () => {
    const { service, aggregate } = fixture([]);
    const token = encodeReceivedRepliesCursor(
      { createdAt: new Date('2026-10-20T00:00:00.000Z'), id: ANSWER_IDS[0] },
      'another-owner',
    );
    await expect(service.forOwner('owner', token)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(aggregate).not.toHaveBeenCalled();
  });

  it('propagates Mongo errors instead of returning fictitious empty activity', async () => {
    const { service, exec } = fixture([]);
    exec.mockRejectedValue(new Error('Mongo database unavailable'));
    await expect(service.forOwner('owner', undefined)).rejects.toThrow(
      'Mongo database unavailable',
    );
  });
});
