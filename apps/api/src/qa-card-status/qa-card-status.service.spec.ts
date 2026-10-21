import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Model } from 'mongoose';

import { Question } from '../qa/mongo/qa.mongo-schemas';
import {
  QaCardStatusService,
  type QaCardStatus,
} from './qa-card-status.service';

const IDS = Array.from(
  { length: 21 },
  (_, index) =>
    '269f2da7-f70c-418d-9151-' + String(index + 1).padStart(12, '0'),
);
const SUBJECT_ID = 'bbde8519-5796-429c-b078-7b705edc5a0b';

function result(
  index: number,
  changes: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    questionId: IDS[index],
    subjectId: SUBJECT_ID,
    state: 'open',
    isOwnQuestion: index === 0,
    hasVisibleAnswer: index === 1,
    hasAcceptedVisibleAnswer: false,
    title: 'Do not expose this title in batch status',
    authorUserId: 'never-return-this',
    ...changes,
  };
}

function fixture(rows: unknown = []) {
  const exec = jest.fn().mockResolvedValue(rows);
  const option = jest.fn().mockReturnValue({ exec });
  const aggregate = jest.fn<unknown, [unknown[]]>().mockReturnValue({ option });
  const service = new QaCardStatusService({
    aggregate,
  } as unknown as Model<Question>);
  return { service, aggregate, option, exec };
}

describe('B168 moderated Q&A card refresh batch', () => {
  it('preserves request order and omits missing or hidden parents', async () => {
    const { service, aggregate, option } = fixture([
      result(1, {
        state: 'closed',
        hasVisibleAnswer: true,
        hasAcceptedVisibleAnswer: true,
      }),
      result(0),
    ]);
    const response = await service.forViewer('signed-in-user', {
      questionIds: [IDS[0], IDS[2], IDS[1]],
    });
    expect(response).toEqual({
      items: [
        {
          questionId: IDS[0],
          subjectId: SUBJECT_ID,
          state: 'open',
          isOwnQuestion: true,
          hasVisibleAnswer: false,
          hasAcceptedVisibleAnswer: false,
        },
        {
          questionId: IDS[1],
          subjectId: SUBJECT_ID,
          state: 'closed',
          isOwnQuestion: false,
          hasVisibleAnswer: true,
          hasAcceptedVisibleAnswer: true,
        },
      ],
    });
    const pipeline = aggregate.mock.calls[0]?.[0];
    expect(pipeline?.[0]).toEqual({
      $match: {
        id: { $in: [IDS[0], IDS[2], IDS[1]] },
        moderationState: 'available',
        state: { $in: ['open', 'closed'] },
      },
    });
    expect(pipeline?.[1]).toEqual({ $limit: 20 });
    expect(pipeline?.[2]).toEqual({
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
    });
    expect(pipeline?.[3]).toEqual({
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
    });
    expect(pipeline?.[4]).toEqual({
      $project: {
        _id: 0,
        questionId: '$id',
        subjectId: 1,
        state: 1,
        isOwnQuestion: { $eq: ['$authorUserId', 'signed-in-user'] },
        hasVisibleAnswer: { $gt: [{ $size: '$visibleAnswers' }, 0] },
        hasAcceptedVisibleAnswer: {
          $gt: [{ $size: '$acceptedVisible' }, 0],
        },
      },
    });
    expect(option).toHaveBeenCalledWith({ maxTimeMS: 5000 });
    expect(aggregate).toHaveBeenCalledTimes(1);
  });

  it('returns empty items without disclosing which IDs were moderated', async () => {
    const { service } = fixture([]);
    await expect(
      service.forViewer('viewer', { questionIds: [IDS[0]] }),
    ).resolves.toEqual({ items: [] });
  });

  it('accepts a full twenty-question batch', async () => {
    const { service, aggregate } = fixture([]);
    await expect(
      service.forViewer('viewer', { questionIds: IDS.slice(0, 20) }),
    ).resolves.toEqual({ items: [] });
    const pipeline = aggregate.mock.calls[0]?.[0];
    expect(pipeline?.[1]).toEqual({ $limit: 20 });
  });

  it.each([
    null,
    [],
    {},
    { questionIds: [] },
    { questionIds: 'invalid' },
    { questionIds: [IDS[0], IDS[0]] },
    { questionIds: IDS },
    { questionIds: ['not-a-uuid'] },
    { questionIds: [IDS[0].toUpperCase()] },
    { questionIds: [IDS[0]], anotherUserId: 'other-user' },
    { questionIds: [IDS[0]], limit: 500 },
  ])('rejects malformed batches before Mongo access', async (input) => {
    const { service, aggregate } = fixture([]);
    await expect(service.forViewer('viewer', input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(aggregate).not.toHaveBeenCalled();
  });

  it.each([
    [result(0, { questionId: 'not-a-uuid' })],
    [result(0, { subjectId: '' })],
    [result(0, { state: 'hidden' })],
    [result(0, { isOwnQuestion: 'true' })],
    [result(0, { hasVisibleAnswer: null })],
    [result(0, { hasAcceptedVisibleAnswer: true })],
    [result(1)],
  ])('fails closed for malformed or unrequested Mongo rows', async (row) => {
    const { service } = fixture([row]);
    await expect(
      service.forViewer('viewer', { questionIds: [IDS[0]] }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects duplicate and excessive aggregate results', async () => {
    const duplicated = fixture([result(0), result(0)]);
    await expect(
      duplicated.service.forViewer('viewer', {
        questionIds: [IDS[0], IDS[1]],
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    const excessive = fixture([result(0), result(1)]);
    await expect(
      excessive.service.forViewer('viewer', { questionIds: [IDS[0]] }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('propagates Mongo errors instead of inventing an empty batch', async () => {
    const { service, exec } = fixture([]);
    exec.mockRejectedValue(new Error('Mongo unavailable'));
    await expect(
      service.forViewer('viewer', { questionIds: [IDS[0]] }),
    ).rejects.toThrow('Mongo unavailable');
  });

  it('does not include private fields in the public response type', () => {
    const returned: QaCardStatus = {
      questionId: IDS[0] ?? '',
      subjectId: SUBJECT_ID,
      state: 'open',
      isOwnQuestion: false,
      hasVisibleAnswer: false,
      hasAcceptedVisibleAnswer: false,
    };
    expect(Object.keys(returned).sort()).toEqual([
      'hasAcceptedVisibleAnswer',
      'hasVisibleAnswer',
      'isOwnQuestion',
      'questionId',
      'state',
      'subjectId',
    ]);
  });
});
