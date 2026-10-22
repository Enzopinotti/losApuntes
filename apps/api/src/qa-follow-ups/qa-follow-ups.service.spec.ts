import { ServiceUnavailableException } from '@nestjs/common';
import type { Model } from 'mongoose';

import { Question } from '../qa/mongo/qa.mongo-schemas';
import {
  QaFollowUpsService,
  QA_FOLLOW_UP_PAGE_SIZE,
} from './qa-follow-ups.service';

function item(id: string, hasVisibleAnswer: boolean) {
  return {
    id,
    subjectId: 'subject-one',
    title: 'How do I prepare for the final?',
    updatedAt: new Date('2026-10-19T13:30:00.000Z'),
    hasVisibleAnswer,
    authorUserId: 'must-not-leak',
    answerCount: 99,
    visibleAnswers: [{ private: 'must-not-leak' }],
  };
}

function fixture(rows: unknown = [{ needsReview: [], awaitingReplies: [] }]) {
  const exec = jest.fn().mockResolvedValue(rows);
  const option = jest.fn().mockReturnValue({ exec });
  const aggregate = jest.fn<unknown, [unknown[]]>().mockReturnValue({ option });
  const service = new QaFollowUpsService({
    aggregate,
  } as unknown as Model<Question>);
  return { service, aggregate, option, exec };
}

describe('B161 My Q&A follow-ups', () => {
  it('returns separated private actionable lanes without leaking answer data', async () => {
    const { service, aggregate, option } = fixture([
      {
        needsReview: [item('review-one', true)],
        awaitingReplies: [item('waiting-one', false)],
      },
    ]);
    await expect(service.forOwner('session-owner')).resolves.toEqual({
      needsReview: {
        items: [
          {
            questionId: 'review-one',
            subjectId: 'subject-one',
            title: 'How do I prepare for the final?',
            updatedAt: '2026-10-19T13:30:00.000Z',
          },
        ],
        hasMore: false,
      },
      awaitingReplies: {
        items: [
          {
            questionId: 'waiting-one',
            subjectId: 'subject-one',
            title: 'How do I prepare for the final?',
            updatedAt: '2026-10-19T13:30:00.000Z',
          },
        ],
        hasMore: false,
      },
    });

    const pipeline = aggregate.mock.calls[0]?.[0];
    expect(pipeline?.[0]).toEqual({
      $match: {
        authorUserId: 'session-owner',
        moderationState: 'available',
        state: 'open',
        acceptedAnswerId: null,
      },
    });
    expect(pipeline?.[1]).toEqual({
      $sort: { updatedAt: -1, id: 1 },
    });
    expect(pipeline?.[2]).toEqual({
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
          { $project: { _id: 1 } },
          { $limit: 1 },
        ],
        as: 'visibleAnswers',
      },
    });
    expect(pipeline?.[3]).toEqual({
      $addFields: {
        hasVisibleAnswer: { $gt: [{ $size: '$visibleAnswers' }, 0] },
      },
    });
    expect(pipeline?.[5]).toEqual({
      $facet: {
        needsReview: [
          { $match: { hasVisibleAnswer: true } },
          { $limit: QA_FOLLOW_UP_PAGE_SIZE + 1 },
        ],
        awaitingReplies: [
          { $match: { hasVisibleAnswer: false } },
          { $limit: QA_FOLLOW_UP_PAGE_SIZE + 1 },
        ],
      },
    });
    expect(option).toHaveBeenCalledWith({ maxTimeMS: 5000 });
    expect(aggregate).toHaveBeenCalledTimes(1);
  });

  it('returns two empty lanes for a new account', async () => {
    const { service } = fixture();
    await expect(service.forOwner('new-student')).resolves.toEqual({
      needsReview: { items: [], hasMore: false },
      awaitingReplies: { items: [], hasMore: false },
    });
  });

  it('returns at most five cards per lane and signals more items', async () => {
    const needsReview = Array.from({ length: 6 }, (_, index) =>
      item('review-' + String(index), true),
    );
    const awaitingReplies = Array.from({ length: 6 }, (_, index) =>
      item('waiting-' + String(index), false),
    );
    const { service } = fixture([{ needsReview, awaitingReplies }]);
    const result = await service.forOwner('owner');
    expect(result.needsReview.items).toHaveLength(5);
    expect(result.awaitingReplies.items).toHaveLength(5);
    expect(result.needsReview.hasMore).toBe(true);
    expect(result.awaitingReplies.hasMore).toBe(true);
  });

  it.each([
    [item('', true)],
    [{ ...item('one', true), subjectId: '' }],
    [{ ...item('one', true), title: '  ' }],
    [{ ...item('one', true), updatedAt: 'not-date' }],
    [{ ...item('one', true), updatedAt: new Date('broken') }],
    [{ ...item('one', true), hasVisibleAnswer: false }],
    [{ ...item('one', true), id: ' '.repeat(129) }],
    [{ ...item('one', true), title: 'x'.repeat(1025) }],
  ])('rejects malformed or misclassified review rows', async (invalid) => {
    const { service } = fixture([
      { needsReview: [invalid], awaitingReplies: [] },
    ]);
    await expect(service.forOwner('owner')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects a question repeated across both lanes', async () => {
    const { service } = fixture([
      {
        needsReview: [item('same', true)],
        awaitingReplies: [item('same', false)],
      },
    ]);
    await expect(service.forOwner('owner')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects unexpected facet shapes and excess rows', async () => {
    const { service } = fixture([
      {
        needsReview: Array.from({ length: 7 }, (_, index) =>
          item(String(index), true),
        ),
        awaitingReplies: [],
      },
    ]);
    await expect(service.forOwner('owner')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    const broken = fixture([{ needsReview: [], awaitingReplies: null }]);
    await expect(broken.service.forOwner('owner')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    const missing = fixture([]);
    await expect(missing.service.forOwner('owner')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('propagates Mongo failures without a false empty inbox', async () => {
    const { service, exec } = fixture();
    exec.mockRejectedValue(new Error('Mongo disconnected'));
    await expect(service.forOwner('owner')).rejects.toThrow(
      'Mongo disconnected',
    );
  });
});
