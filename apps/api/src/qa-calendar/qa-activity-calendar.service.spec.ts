import { ServiceUnavailableException } from '@nestjs/common';
import type { Model } from 'mongoose';

import { Answer, Question } from '../qa/mongo/qa.mongo-schemas';
import {
  QaActivityCalendarService,
  QA_ACTIVITY_CALENDAR_DAYS,
} from './qa-activity-calendar.service';

const NOW = new Date('2026-10-20T23:40:01.000Z');

function fixture(questionRows: unknown[], answerRows: unknown[]) {
  const questionExec = jest.fn().mockResolvedValue(questionRows);
  const answerExec = jest.fn().mockResolvedValue(answerRows);
  const questionOption = jest.fn().mockReturnValue({ exec: questionExec });
  const answerOption = jest.fn().mockReturnValue({ exec: answerExec });
  const questionAggregate = jest
    .fn<unknown, [unknown[]]>()
    .mockReturnValue({ option: questionOption });
  const answerAggregate = jest
    .fn<unknown, [unknown[]]>()
    .mockReturnValue({ option: answerOption });

  const service = new QaActivityCalendarService(
    { aggregate: questionAggregate } as unknown as Model<Question>,
    { aggregate: answerAggregate } as unknown as Model<Answer>,
  );
  return {
    service,
    questionAggregate,
    answerAggregate,
    questionOption,
    answerOption,
    questionExec,
    answerExec,
  };
}

describe('B165 private Q&A UTC activity calendar', () => {
  it('returns exactly 28 ordered days, filling absent days with zeros', async () => {
    const { service } = fixture(
      [
        { day: '2026-10-19', count: 1 },
        { day: '2026-10-20', count: 3 },
      ],
      [
        { day: '2026-10-18', count: 4 },
        { day: '2026-10-20', count: 2 },
      ],
    );
    const result = await service.forOwner('student-one', NOW);
    expect(result.asOfUtc).toBe('2026-10-20T23:40:01.000Z');
    expect(result.windowStartUtc).toBe('2026-09-23T00:00:00.000Z');
    expect(result.windowEndUtcExclusive).toBe(
      '2026-10-21T00:00:00.000Z',
    );
    expect(result.days).toHaveLength(QA_ACTIVITY_CALENDAR_DAYS);
    expect(result.days[0]).toEqual({
      dateUtc: '2026-09-23',
      questions: 0,
      answers: 0,
      total: 0,
    });
    expect(result.days[25]).toEqual({
      dateUtc: '2026-10-18',
      questions: 0,
      answers: 4,
      total: 4,
    });
    expect(result.days[26]).toEqual({
      dateUtc: '2026-10-19',
      questions: 1,
      answers: 0,
      total: 1,
    });
    expect(result.days[27]).toEqual({
      dateUtc: '2026-10-20',
      questions: 3,
      answers: 2,
      total: 5,
    });
  });

  it('queries only owner-authored available content within UTC boundaries', async () => {
    const {
      service,
      questionAggregate,
      answerAggregate,
      questionOption,
      answerOption,
    } = fixture([], []);
    await service.forOwner('real-session-owner', NOW);

    const start = new Date('2026-09-23T00:00:00.000Z');
    const end = new Date('2026-10-21T00:00:00.000Z');
    const questionPipeline = questionAggregate.mock.calls[0]?.[0];
    const answerPipeline = answerAggregate.mock.calls[0]?.[0];

    expect(questionPipeline?.[0]).toEqual({
      $match: {
        authorUserId: 'real-session-owner',
        moderationState: 'available',
        state: { $in: ['open', 'closed'] },
        createdAt: { $gte: start, $lt: end },
      },
    });
    expect(answerPipeline?.[0]).toEqual({
      $match: {
        authorUserId: 'real-session-owner',
        moderationState: 'available',
        createdAt: { $gte: start, $lt: end },
      },
    });
    expect(answerPipeline?.[1]).toEqual({
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
          { $project: { _id: 1 } },
          { $limit: 1 },
        ],
        as: 'visibleParent',
      },
    });
    expect(answerPipeline?.[2]).toEqual({ $unwind: '$visibleParent' });
    expect(questionPipeline?.[1]).toEqual({
      $group: {
        _id: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$createdAt',
            timezone: 'UTC',
          },
        },
        count: { $sum: 1 },
      },
    });
    expect(questionPipeline?.[4]).toEqual({
      $limit: QA_ACTIVITY_CALENDAR_DAYS + 1,
    });
    expect(answerPipeline?.[5]).toEqual({
      $limit: QA_ACTIVITY_CALENDAR_DAYS + 1,
    });
    expect(questionOption).toHaveBeenCalledWith({ maxTimeMS: 5000 });
    expect(answerOption).toHaveBeenCalledWith({ maxTimeMS: 5000 });
    expect(questionAggregate).toHaveBeenCalledTimes(1);
    expect(answerAggregate).toHaveBeenCalledTimes(1);
  });

  it('anchors around UTC midnight, not the caller timezone', async () => {
    const { service } = fixture([], []);
    const today = await service.forOwner(
      'owner',
      new Date('2026-10-21T00:01:00.000Z'),
    );
    expect(today.days[27]?.dateUtc).toBe('2026-10-21');
    expect(today.windowStartUtc).toBe('2026-09-24T00:00:00.000Z');
    expect(today.windowEndUtcExclusive).toBe(
      '2026-10-22T00:00:00.000Z',
    );
  });

  it.each([
    [[{ day: '2026-09-22', count: 1 }], []],
    [[{ day: '2026-10-21', count: 1 }], []],
    [[{ day: '2026-10-20', count: -1 }], []],
    [[{ day: '2026-10-20', count: 1.3 }], []],
    [[{ day: '2026-10-20', count: Number.NaN }], []],
    [[{ day: '2026-10-20', count: '3' }], []],
    [[{ day: '2026-10-20', count: 2 }, { day: '2026-10-20', count: 4 }], []],
    [[], [{ day: '2026-10-20', count: Number.MAX_SAFE_INTEGER + 1 }]],
  ])('rejects impossible or duplicate Mongo rows', async (questions, answers) => {
    const { service } = fixture(questions, answers);
    await expect(service.forOwner('owner', NOW)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects unsafe cross-collection integer addition', async () => {
    const { service } = fixture(
      [{ day: '2026-10-20', count: Number.MAX_SAFE_INTEGER }],
      [{ day: '2026-10-20', count: 1 }],
    );
    await expect(service.forOwner('owner', NOW)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects invalid clocks and oversized aggregation output', async () => {
    const { service } = fixture([], []);
    await expect(
      service.forOwner('owner', new Date('invalid')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    const rows = Array.from({ length: 29 }, () => ({
      day: '2026-10-20',
      count: 1,
    }));
    const excessive = fixture(rows, []);
    await expect(excessive.service.forOwner('owner', NOW)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('propagates Mongo failures instead of fabricating zero-activity days', async () => {
    const { service, answerExec } = fixture([], []);
    answerExec.mockRejectedValue(new Error('Mongo unavailable'));
    await expect(service.forOwner('owner', NOW)).rejects.toThrow(
      'Mongo unavailable',
    );
  });
});
