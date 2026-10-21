import { ServiceUnavailableException } from '@nestjs/common';
import type { Model } from 'mongoose';

import { Question } from '../qa/mongo/qa.mongo-schemas';
import {
  QaDiscussionsService,
  QA_DISCUSSIONS_PREVIEW_LIMIT,
} from './qa-discussions.service';

function discussion(
  questionId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    questionId,
    subjectId: 'subject-one',
    title: 'How should I study for the exam?',
    state: 'open',
    isQuestionAuthor: false,
    ownVisibleAnswersCount: 2,
    lastActivityAt: new Date('2026-10-19T13:30:00.000Z'),
    answerAuthorId: 'private-user-must-not-appear',
    body: 'private answer body must not appear',
    ...overrides,
  };
}

function fixture(rows: unknown[]) {
  const exec = jest.fn().mockResolvedValue(rows);
  const option = jest.fn().mockReturnValue({ exec });
  const aggregate = jest.fn<unknown, [unknown[]]>().mockReturnValue({ option });
  const service = new QaDiscussionsService({
    aggregate,
  } as unknown as Model<Question>);
  return { service, aggregate, option, exec };
}

describe('B162 My Q&A discussions', () => {
  it('returns one card per participated available question without PII', async () => {
    const { service, aggregate, option } = fixture([
      discussion('question-one', {
        isQuestionAuthor: true,
        ownVisibleAnswersCount: 1,
      }),
      discussion('question-two', { state: 'closed' }),
    ]);
    await expect(service.previewForOwner('session-owner')).resolves.toEqual({
      items: [
        {
          questionId: 'question-one',
          subjectId: 'subject-one',
          title: 'How should I study for the exam?',
          state: 'open',
          isQuestionAuthor: true,
          ownVisibleAnswersCount: 1,
          lastActivityAt: '2026-10-19T13:30:00.000Z',
        },
        {
          questionId: 'question-two',
          subjectId: 'subject-one',
          title: 'How should I study for the exam?',
          state: 'closed',
          isQuestionAuthor: false,
          ownVisibleAnswersCount: 2,
          lastActivityAt: '2026-10-19T13:30:00.000Z',
        },
      ],
      hasMore: false,
    });
    expect(aggregate).toHaveBeenCalledTimes(1);
    expect(option).toHaveBeenCalledWith({ maxTimeMS: 5000 });
  });

  it('scopes both union branches to owner and filters unavailable parents', () => {
    const { aggregate, service } = fixture([]);
    void service.previewForOwner('session-owner');

    const pipeline = aggregate.mock.calls[0]?.[0];
    expect(pipeline?.[0]).toEqual({
      $match: {
        authorUserId: 'session-owner',
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
              authorUserId: 'session-owner',
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
                    id: 1,
                    subjectId: 1,
                    title: 1,
                    state: 1,
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
              questionId: '$visibleQuestion.id',
              subjectId: '$visibleQuestion.subjectId',
              title: '$visibleQuestion.title',
              state: '$visibleQuestion.state',
              isQuestionAuthor: { $literal: false },
              ownVisibleAnswersCount: { $literal: 1 },
              lastActivityAt: '$updatedAt',
            },
          },
        ],
      },
    });
    expect(pipeline?.[3]).toEqual({
      $group: {
        _id: '$questionId',
        subjectId: { $first: '$subjectId' },
        title: { $first: '$title' },
        state: { $first: '$state' },
        isQuestionAuthor: { $max: '$isQuestionAuthor' },
        ownVisibleAnswersCount: { $sum: '$ownVisibleAnswersCount' },
        lastActivityAt: { $max: '$lastActivityAt' },
      },
    });
    expect(pipeline?.[5]).toEqual({
      $sort: { lastActivityAt: -1, questionId: 1 },
    });
    expect(pipeline?.[6]).toEqual({
      $limit: QA_DISCUSSIONS_PREVIEW_LIMIT + 1,
    });
  });

  it('returns an empty preview for an account with no visible participation', async () => {
    const { service } = fixture([]);
    await expect(service.previewForOwner('new-user')).resolves.toEqual({
      items: [],
      hasMore: false,
    });
  });

  it('returns a fifteen-card preview with an overflow marker', async () => {
    const rows = Array.from({ length: 16 }, (_, index) =>
      discussion('question-' + String(index).padStart(3, '0')),
    );
    const { service } = fixture(rows);
    const result = await service.previewForOwner('session-owner');
    expect(result.items).toHaveLength(15);
    expect(result.hasMore).toBe(true);
    expect(result.items[0]?.questionId).toBe('question-000');
    expect(result.items[14]?.questionId).toBe('question-014');
  });

  it.each([
    [{ questionId: '' }],
    [{ subjectId: ' ' }],
    [{ title: '' }],
    [{ title: 'x'.repeat(2049) }],
    [{ state: 'hidden' }],
    [{ isQuestionAuthor: 'true' }],
    [{ ownVisibleAnswersCount: -1 }],
    [{ ownVisibleAnswersCount: 1.4 }],
    [{ ownVisibleAnswersCount: Number.NaN }],
    [{ lastActivityAt: 'not-a-date' }],
    [{ lastActivityAt: new Date('invalid') }],
  ])('rejects malformed or unsafe aggregate rows', async (override) => {
    const { service } = fixture([discussion('valid-id', override)]);
    await expect(service.previewForOwner('owner')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('fails closed on duplicate question cards or excess group rows', async () => {
    const duplicate = fixture([
      discussion('question-one'),
      discussion('question-one'),
    ]);
    await expect(
      duplicate.service.previewForOwner('owner'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    const tooMany = fixture(
      Array.from({ length: 17 }, (_, index) =>
        discussion('question-' + String(index)),
      ),
    );
    await expect(
      tooMany.service.previewForOwner('owner'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('propagates Mongo failure rather than returning a fabricated empty list', async () => {
    const { service, exec } = fixture([]);
    exec.mockRejectedValue(new Error('Mongo unavailable'));
    await expect(service.previewForOwner('owner')).rejects.toThrow(
      'Mongo unavailable',
    );
  });
});
