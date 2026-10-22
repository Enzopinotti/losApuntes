import { ServiceUnavailableException } from '@nestjs/common';
import type { Model } from 'mongoose';

import { Question } from '../qa/mongo/qa.mongo-schemas';
import {
  QaSubjectActivityService,
  QA_SUBJECT_ACTIVITY_PAGE_SIZE,
} from './qa-subject-activity.service';

function row(subjectId: string, count = 1): Record<string, unknown> {
  return {
    subjectId,
    questionsOpen: count,
    questionsClosed: 2,
    answersVisible: 4,
    answersAccepted: 1,
    totalActivity: count + 6,
  };
}

function fixture(rows: unknown[]) {
  const aggregate = jest.fn<unknown, [unknown[]]>();
  const exec = jest.fn().mockResolvedValue(rows);
  const option = jest.fn().mockReturnValue({ exec });
  aggregate.mockReturnValue({ option });
  const service = new QaSubjectActivityService({
    aggregate,
  } as unknown as Model<Question>);
  return { service, aggregate, option, exec };
}

describe('B160 subject activity aggregation', () => {
  it('matches only owner content and joins answer parent moderation', async () => {
    const { service, aggregate, option } = fixture([row('subject-one')]);
    await expect(service.forOwner('owner-one')).resolves.toEqual({
      items: [
        {
          subjectId: 'subject-one',
          questionsTotal: 3,
          questionsOpen: 1,
          questionsClosed: 2,
          answersVisible: 4,
          answersAccepted: 1,
          totalActivity: 7,
        },
      ],
      hasMore: false,
    });

    const pipeline = aggregate.mock.calls[0]?.[0];
    expect(pipeline?.[0]).toEqual({
      $match: {
        authorUserId: 'owner-one',
        moderationState: 'available',
        state: { $in: ['open', 'closed'] },
      },
    });
    expect(pipeline?.[2]).toEqual({
      $unionWith: {
        coll: 'answers',
        pipeline: [
          {
            $match: {
              authorUserId: 'owner-one',
              moderationState: 'available',
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
                {
                  $project: {
                    _id: 0,
                    subjectId: 1,
                    acceptedAnswerId: 1,
                  },
                },
                { $limit: 1 },
              ],
              as: 'visibleQuestion',
            },
          },
          { $unwind: '$visibleQuestion' },
          {
            $project: {
              _id: 0,
              subjectId: '$visibleQuestion.subjectId',
              questionsOpen: { $literal: 0 },
              questionsClosed: { $literal: 0 },
              answersVisible: { $literal: 1 },
              answersAccepted: {
                $cond: [
                  { $eq: ['$id', '$visibleQuestion.acceptedAnswerId'] },
                  1,
                  0,
                ],
              },
            },
          },
        ],
      },
    });
    expect(pipeline?.[3]).toEqual({
      $group: {
        _id: '$subjectId',
        questionsOpen: { $sum: '$questionsOpen' },
        questionsClosed: { $sum: '$questionsClosed' },
        answersVisible: { $sum: '$answersVisible' },
        answersAccepted: { $sum: '$answersAccepted' },
      },
    });
    expect(pipeline?.[5]).toEqual({
      $sort: { totalActivity: -1, subjectId: 1 },
    });
    expect(pipeline?.[6]).toEqual({
      $limit: QA_SUBJECT_ACTIVITY_PAGE_SIZE + 1,
    });
    expect(option).toHaveBeenCalledWith({ maxTimeMS: 5000 });
    expect(aggregate).toHaveBeenCalledTimes(1);
  });

  it('returns empty data without fabricating activity', async () => {
    const { service } = fixture([]);
    await expect(service.forOwner('new-user')).resolves.toEqual({
      items: [],
      hasMore: false,
    });
  });

  it('caps the response at twenty with an explicit overflow signal', async () => {
    const data = Array.from({ length: 21 }, (_, index) =>
      row('subject-' + String(index).padStart(3, '0'), 21 - index),
    );
    const { service } = fixture(data);
    const result = await service.forOwner('owner');
    expect(result.items).toHaveLength(20);
    expect(result.items[0]?.subjectId).toBe('subject-000');
    expect(result.items[19]?.subjectId).toBe('subject-019');
    expect(result.hasMore).toBe(true);
  });

  it.each([
    [{ ...row('s'), answersAccepted: 5 }],
    [{ ...row('s'), questionsClosed: -1 }],
    [{ ...row('s'), answersVisible: Number.NaN }],
    [{ ...row('s'), totalActivity: 300 }],
    [{ ...row('s'), questionsOpen: 1.5 }],
    [{ ...row('') }],
    [{ ...row(' s ') }],
    [{ ...row('x'.repeat(129)) }],
    [{ ...row('s'), totalActivity: Number.MAX_SAFE_INTEGER }],
  ])('rejects impossible stored counter rows', async (invalid) => {
    const { service } = fixture([invalid]);
    await expect(service.forOwner('owner')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('fails closed on duplicate subject group IDs', async () => {
    const { service } = fixture([row('same'), row('same')]);
    await expect(service.forOwner('owner')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('fails closed if persistence returns more than the bounded window', async () => {
    const data = Array.from({ length: 22 }, (_, i) => row(String(i)));
    const { service } = fixture(data);
    await expect(service.forOwner('owner')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('propagates Mongo errors instead of returning fake zero counts', async () => {
    const { service, exec } = fixture([]);
    exec.mockRejectedValue(new Error('Mongo offline'));
    await expect(service.forOwner('owner')).rejects.toThrow('Mongo offline');
  });
});
