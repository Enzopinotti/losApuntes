import {
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { encodeMyAnswersCursor } from './qa-my-answers.cursor';
import { QaMyAnswersService } from './qa-my-answers.service';

const date = new Date('2026-10-19T20:00:00.000Z');
const answerId = '11111111-1111-4111-8111-111111111111';
const questionId = '22222222-2222-4222-8222-222222222222';
const subjectId = '33333333-3333-4333-8333-333333333333';

function answer(
  id = answerId,
  createdAt = date,
  acceptedAnswerId: string | null = null,
) {
  return {
    id,
    questionId,
    authorUserId: 'owner-a',
    body: 'La normalización separa dependencias transitivas.',
    revision: 2,
    createdAt,
    updatedAt: createdAt,
    question: {
      id: questionId,
      title: 'Normalización en SQL',
      subjectId,
      state: 'open' as const,
      acceptedAnswerId,
    },
    moderationState: 'available',
    secretInternalField: 'never-return-this',
  };
}

function setup(rows: unknown[]) {
  const exec = jest.fn().mockResolvedValue(rows);
  const aggregate = jest.fn().mockReturnValue({ exec });
  const service = new QaMyAnswersService({ aggregate } as never);
  return { service, aggregate, exec };
}

describe('B146 private My Answers service', () => {
  it('paginates authored visible answers and projects only safe fields', async () => {
    const otherId = '44444444-4444-4444-8444-444444444444';
    const { service, aggregate } = setup([
      answer(answerId, date, answerId),
      answer(otherId, new Date('2026-10-18T20:00:00.000Z')),
    ]);

    const page = await service.list('owner-a', { limit: 1 });
    expect(page.items).toEqual([
      {
        id: answerId,
        question: {
          id: questionId,
          subjectId,
          title: 'Normalización en SQL',
          state: 'open',
        },
        body: 'La normalización separa dependencias transitivas.',
        revision: 2,
        accepted: true,
        createdAt: date.toISOString(),
        updatedAt: date.toISOString(),
      },
    ]);
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(JSON.stringify(page)).not.toContain('owner-a');
    expect(JSON.stringify(page)).not.toContain('secretInternalField');

    const calls = aggregate.mock.calls as unknown as Array<[unknown]>;
    const pipeline = calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(pipeline[0]).toEqual({
      $match: {
        authorUserId: 'owner-a',
        moderationState: 'available',
      },
    });
    expect(pipeline[1]).toEqual({ $sort: { createdAt: -1, id: 1 } });
    expect(pipeline[2]).toEqual({
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
    });
    expect(pipeline[3]).toEqual({ $unwind: '$question' });
    expect(pipeline[4]).toEqual({ $limit: 2 });
    expect(pipeline[5]).toMatchObject({ $project: { _id: 0 } });
  });

  it('applies a descending timestamp and ascending tie cursor inside the owner match', async () => {
    const { service, aggregate } = setup([]);
    const cursor = encodeMyAnswersCursor('owner-a', {
      id: answerId,
      createdAt: date,
    });
    await expect(
      service.list('owner-a', { limit: 10, cursor }),
    ).resolves.toEqual({ items: [], nextCursor: null });

    const calls = aggregate.mock.calls as unknown as Array<[unknown]>;
    const pipeline = calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(pipeline[0]).toEqual({
      $match: {
        authorUserId: 'owner-a',
        moderationState: 'available',
        $or: [
          { createdAt: { $lt: date } },
          { createdAt: date, id: { $gt: answerId } },
        ],
      },
    });
  });

  it('blocks a foreign account cursor and invalid limits before any query', async () => {
    const { service, aggregate } = setup([]);
    const cursor = encodeMyAnswersCursor('owner-a', {
      id: answerId,
      createdAt: date,
    });
    await expect(
      service.list('owner-b', { limit: 10, cursor }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    for (const limit of [0, 26, -1, 1.1, Number.NaN]) {
      await expect(service.list('owner-a', { limit })).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    }
    await expect(service.list('', { limit: 25 })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(aggregate).not.toHaveBeenCalled();
  });

  it('fails closed for malformed persisted rows or oversized datastore results', async () => {
    for (const rows of [
      [answer(answerId, date, answerId), answer(answerId)],
      [{ ...answer(), question: null }],
      [{ ...answer(), questionId: 'invalid' }],
      [{ ...answer(), createdAt: new Date('invalid') }],
      [{ ...answer(), revision: 0 }],
    ]) {
      const { service } = setup(rows);
      const limit = 1;
      if (rows.length > limit + 1) continue;
      if (rows.length === 2) continue;
      await expect(service.list('owner-a', { limit })).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    }
    const { service } = setup([answer(), answer(), answer()]);
    await expect(service.list('owner-a', { limit: 1 })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('does not swallow Mongo failures', async () => {
    const { service, exec } = setup([]);
    exec.mockRejectedValue(new Error('mongo-unavailable'));
    await expect(service.list('owner-a', { limit: 25 })).rejects.toThrow(
      'mongo-unavailable',
    );
  });
});
