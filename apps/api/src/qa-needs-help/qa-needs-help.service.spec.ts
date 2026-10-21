import {
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Model } from 'mongoose';

import type { AcademicService } from '../academic/domain/academic.service';
import { Question } from '../qa/mongo/qa.mongo-schemas';
import {
  decodeNeedsHelpCursor,
  encodeNeedsHelpCursor,
} from './qa-needs-help.cursor';
import {
  QaNeedsHelpService,
  QA_NEEDS_HELP_LIMIT,
} from './qa-needs-help.service';

const SUBJECT_ID = 'bbde8519-5796-429c-b078-7b705edc5a0b';
const OTHER_SUBJECT_ID = 'b14211d1-6f33-4e14-a946-6a9218e716c9';
const QUESTION_IDS = Array.from(
  { length: 17 },
  (_, index) =>
    '269f2da7-f70c-418d-9151-' + String(index + 1).padStart(12, '0'),
);
const CREATED = new Date('2026-10-20T11:00:01.000Z');

function card(index: number, changes: Record<string, unknown> = {}) {
  return {
    questionId: QUESTION_IDS[index],
    subjectId: SUBJECT_ID,
    title: 'Necesito ayuda con el parcial',
    createdAt: CREATED,
    authorUserId: 'should-not-be-returned',
    body: 'should-not-be-returned',
    ...changes,
  };
}

function fixture(rows: unknown[]) {
  const exec = jest.fn().mockResolvedValue(rows);
  const option = jest.fn().mockReturnValue({ exec });
  const aggregate = jest.fn<unknown, [unknown[]]>().mockReturnValue({ option });
  const resolveResourceContext = jest.fn().mockResolvedValue({
    subjectId: SUBJECT_ID,
  });
  const service = new QaNeedsHelpService(
    { aggregate } as unknown as Model<Question>,
    { resolveResourceContext } as unknown as AcademicService,
  );
  return { service, aggregate, option, exec, resolveResourceContext };
}

describe('B166 questions needing help discovery', () => {
  it('finds unanswered, available, open peer questions without answerCount', async () => {
    const { service, aggregate, option, resolveResourceContext } = fixture([
      card(0),
    ]);
    const result = await service.forSubject('viewer-one', SUBJECT_ID, undefined);
    expect(result).toEqual({
      items: [
        {
          questionId: QUESTION_IDS[0],
          subjectId: SUBJECT_ID,
          title: 'Necesito ayuda con el parcial',
          createdAt: CREATED.toISOString(),
        },
      ],
      nextCursor: null,
    });
    expect(resolveResourceContext).toHaveBeenCalledWith(SUBJECT_ID);
    const pipeline = aggregate.mock.calls[0]?.[0];
    expect(pipeline?.[0]).toEqual({
      $match: {
        subjectId: SUBJECT_ID,
        state: 'open',
        moderationState: 'available',
        authorUserId: { $ne: 'viewer-one' },
      },
    });
    expect(pipeline?.[1]).toEqual({ $sort: { createdAt: 1, id: 1 } });
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
      $match: { 'visibleAnswers.0': { $exists: false } },
    });
    expect(pipeline?.[4]).toEqual({
      $project: {
        _id: 0,
        questionId: '$id',
        subjectId: 1,
        title: 1,
        createdAt: 1,
      },
    });
    expect(pipeline?.[5]).toEqual({ $limit: QA_NEEDS_HELP_LIMIT + 1 });
    expect(option).toHaveBeenCalledWith({ maxTimeMS: 5000 });
  });

  it('returns empty page for subjects without visible unanswered peer questions', async () => {
    const { service } = fixture([]);
    const result = await service.forSubject('viewer', SUBJECT_ID, undefined);
    expect(result).toEqual({ items: [], nextCursor: null });
  });

  it('limits to fifteen questions and returns a scoped next cursor', async () => {
    const { service } = fixture(
      Array.from({ length: 16 }, (_, index) => card(index)),
    );
    const result = await service.forSubject('viewer', SUBJECT_ID, undefined);
    expect(result.items).toHaveLength(15);
    expect(result.items[0]?.questionId).toBe(QUESTION_IDS[0]);
    expect(result.items[14]?.questionId).toBe(QUESTION_IDS[14]);
    expect(
      decodeNeedsHelpCursor(result.nextCursor, SUBJECT_ID, 'viewer'),
    ).toEqual({
      createdAt: CREATED,
      questionId: QUESTION_IDS[14],
    });
  });

  it('pushes strictly-after keyset filter ahead of visibility lookup', async () => {
    const { service, aggregate } = fixture([]);
    const cursor = encodeNeedsHelpCursor(
      { createdAt: CREATED, questionId: QUESTION_IDS[1] ?? '' },
      SUBJECT_ID,
      'viewer',
    );
    await service.forSubject('viewer', SUBJECT_ID, cursor);
    const pipeline = aggregate.mock.calls[0]?.[0];
    expect(pipeline?.[0]).toEqual({
      $match: {
        subjectId: SUBJECT_ID,
        state: 'open',
        moderationState: 'available',
        authorUserId: { $ne: 'viewer' },
        $or: [
          { createdAt: { $gt: CREATED } },
          { createdAt: CREATED, id: { $gt: QUESTION_IDS[1] } },
        ],
      },
    });
  });

  it('rejects a cross-session cursor before attempting Mongo aggregation', async () => {
    const { service, aggregate } = fixture([]);
    const token = encodeNeedsHelpCursor(
      { createdAt: CREATED, questionId: QUESTION_IDS[0] ?? '' },
      SUBJECT_ID,
      'someone-else',
    );
    const request = service.forSubject('viewer', SUBJECT_ID, token);
    await expect(request).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(aggregate).not.toHaveBeenCalled();
  });

  it.each([
    [{ questionId: 'invalid' }],
    [{ subjectId: OTHER_SUBJECT_ID }],
    [{ title: '' }],
    [{ title: ' '.repeat(5) }],
    [{ title: 'x'.repeat(181) }],
    [{ createdAt: 'not-date' }],
    [{ createdAt: new Date('invalid') }],
  ])('fails closed for unexpected stored rows', async (change) => {
    const { service } = fixture([card(0, change)]);
    const request = service.forSubject('viewer', SUBJECT_ID, undefined);
    await expect(request).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects duplicates, misordered rows and oversized results', async () => {
    const duplicate = fixture([card(0), card(0)]);
    const duplicated = duplicate.service.forSubject(
      'viewer',
      SUBJECT_ID,
      undefined,
    );
    await expect(duplicated).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    const wrongOrder = fixture([card(1), card(0)]);
    const unordered = wrongOrder.service.forSubject(
      'viewer',
      SUBJECT_ID,
      undefined,
    );
    await expect(unordered).rejects.toBeInstanceOf(ServiceUnavailableException);
    const oversized = fixture(
      Array.from({ length: 17 }, (_, index) => card(index)),
    );
    const tooMany = oversized.service.forSubject(
      'viewer',
      SUBJECT_ID,
      undefined,
    );
    await expect(tooMany).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('propagates backend failure instead of silently inventing no questions', async () => {
    const { service, exec } = fixture([]);
    exec.mockRejectedValue(new Error('Mongo unavailable'));
    const request = service.forSubject('viewer', SUBJECT_ID, undefined);
    await expect(request).rejects.toThrow('Mongo unavailable');
  });
});
