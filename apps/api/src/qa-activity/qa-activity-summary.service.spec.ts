import { ServiceUnavailableException } from '@nestjs/common';
import type { Model } from 'mongoose';

import { Answer, Question } from '../qa/mongo/qa.mongo-schemas';
import { QaActivitySummaryService } from './qa-activity-summary.service';

function createFixture(questionRows: unknown[], answerRows: unknown[]) {
  const questionAggregate = jest.fn<unknown, [unknown[]]>();
  const answerAggregate = jest.fn<unknown, [unknown[]]>();
  const questionQuery = {
    option: jest.fn(),
    exec: jest.fn().mockResolvedValue(questionRows),
  };
  const answerQuery = {
    option: jest.fn(),
    exec: jest.fn().mockResolvedValue(answerRows),
  };
  questionQuery.option.mockReturnValue(questionQuery);
  answerQuery.option.mockReturnValue(answerQuery);
  questionAggregate.mockReturnValue(questionQuery);
  answerAggregate.mockReturnValue(answerQuery);

  const service = new QaActivitySummaryService(
    { aggregate: questionAggregate } as unknown as Model<Question>,
    { aggregate: answerAggregate } as unknown as Model<Answer>,
  );

  return {
    service,
    questionAggregate,
    answerAggregate,
    questionQuery,
    answerQuery,
  };
}
describe('B159 Q&A activity summary', () => {
  it('aggregates available owner questions and answers on available parents', async () => {
    const questionRows = [
      {
        questionsTotal: 8,
        questionsOpen: 5,
        questionsClosed: 3,
        questionsOpenWithoutAcceptedAnswer: 2,
      },
    ];
    const {
      service,
      questionAggregate,
      answerAggregate,
      questionQuery,
      answerQuery,
    } = createFixture(questionRows, [
      { answersVisible: 12, answersAccepted: 4 },
    ]);

    await expect(service.forOwner('session-owner')).resolves.toEqual({
      questionsTotal: 8,
      questionsOpen: 5,
      questionsClosed: 3,
      questionsOpenWithoutAcceptedAnswer: 2,
      answersVisible: 12,
      answersAccepted: 4,
    });

    const questionPipeline = questionAggregate.mock.calls[0]?.[0];
    const answerPipeline = answerAggregate.mock.calls[0]?.[0];
    expect(questionPipeline?.[0]).toEqual({
      $match: {
        authorUserId: 'session-owner',
        moderationState: 'available',
        state: { $in: ['open', 'closed'] },
      },
    });
    expect(answerPipeline?.[0]).toEqual({
      $match: {
        authorUserId: 'session-owner',
        moderationState: 'available',
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
          { $project: { _id: 0, acceptedAnswerId: 1 } },
          { $limit: 1 },
        ],
        as: 'visibleQuestion',
      },
    });
    expect(answerPipeline?.[2]).toEqual({ $unwind: '$visibleQuestion' });
    expect(questionAggregate).toHaveBeenCalledTimes(1);
    expect(answerAggregate).toHaveBeenCalledTimes(1);
    expect(questionQuery.option).toHaveBeenCalledWith({ maxTimeMS: 5000 });
    expect(answerQuery.option).toHaveBeenCalledWith({ maxTimeMS: 5000 });
  });

  it('returns all zero counts for an empty account', async () => {
    const { service } = createFixture([], []);
    await expect(service.forOwner('fresh-user')).resolves.toEqual({
      questionsTotal: 0,
      questionsOpen: 0,
      questionsClosed: 0,
      questionsOpenWithoutAcceptedAnswer: 0,
      answersVisible: 0,
      answersAccepted: 0,
    });
  });

  it.each([
    [3, 1, 1, 0],
    [2, 1, 1, 2],
    [-1, 0, 0, 0],
    [1.4, 1.4, 0, 0],
    [1, Number.NaN, 0, 0],
  ])(
    'fails closed for corrupt question aggregate totals',
    async (total, open, closed, missingAccepted) => {
      const { service } = createFixture(
        [
          {
            questionsTotal: total,
            questionsOpen: open,
            questionsClosed: closed,
            questionsOpenWithoutAcceptedAnswer: missingAccepted,
          },
        ],
        [],
      );
      await expect(service.forOwner('owner')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    },
  );

  it('does not invent accepted answers when aggregate counts are inconsistent', async () => {
    const { service } = createFixture(
      [],
      [{ answersVisible: 1, answersAccepted: 2 }],
    );
    await expect(service.forOwner('owner')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects duplicate or malformed aggregate group rows', async () => {
    const one = {
      questionsTotal: 0,
      questionsOpen: 0,
      questionsClosed: 0,
      questionsOpenWithoutAcceptedAnswer: 0,
    };
    const { service } = createFixture([one, one], []);
    await expect(service.forOwner('owner')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('propagates database errors instead of returning synthetic zeros', async () => {
    const { service, answerQuery } = createFixture([], []);
    answerQuery.exec.mockRejectedValue(new Error('Mongo unavailable'));
    await expect(service.forOwner('owner')).rejects.toThrow(
      'Mongo unavailable',
    );
  });
});
