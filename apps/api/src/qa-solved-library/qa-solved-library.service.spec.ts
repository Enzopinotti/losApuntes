import {
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Model } from 'mongoose';

import type { AcademicService } from '../academic/domain/academic.service';
import { Question } from '../qa/mongo/qa.mongo-schemas';
import {
  decodeSolvedQaCursor,
  encodeSolvedQaCursor,
} from './qa-solved-library.cursor';
import {
  QaSolvedLibraryService,
  QA_SOLVED_LIBRARY_PAGE_SIZE,
} from './qa-solved-library.service';

const SUBJECT_ID = 'bbde8519-5796-429c-b078-7b705edc5a0b';
const OTHER_SUBJECT = 'b14211d1-6f33-4e14-a946-6a9218e716c9';
const ACCEPTED_ID = 'a7f8eab6-42c8-4539-9fcd-8ce5d8794581';
const QUESTION_IDS = Array.from(
  { length: 17 },
  (_, index) =>
    '269f2da7-f70c-418d-9151-' + String(index + 1).padStart(12, '0'),
);
const DATE = new Date('2026-10-21T12:00:00.000Z');

function card(index: number, changes: Record<string, unknown> = {}) {
  return {
    questionId: QUESTION_IDS[index],
    subjectId: SUBJECT_ID,
    title: 'Pregunta con respuesta aceptada',
    createdAt: DATE,
    acceptedAnswerId: ACCEPTED_ID,
    authorUserId: 'never-expose',
    answerBody: 'never-expose',
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
  const service = new QaSolvedLibraryService(
    { aggregate } as unknown as Model<Question>,
    { resolveResourceContext } as unknown as AcademicService,
  );
  return { service, aggregate, option, exec, resolveResourceContext };
}

describe('B169 solved Q&A library', () => {
  it('only joins accepted answers that are available and belong to the question', async () => {
    const { service, aggregate, option, resolveResourceContext } = fixture([
      card(0),
    ]);
    const result = await service.forSubject('viewer', SUBJECT_ID, undefined);
    expect(result).toEqual({
      items: [
        {
          questionId: QUESTION_IDS[0],
          subjectId: SUBJECT_ID,
          title: 'Pregunta con respuesta aceptada',
          createdAt: DATE.toISOString(),
          acceptedAnswerId: ACCEPTED_ID,
        },
      ],
      nextCursor: null,
    });
    expect(resolveResourceContext).toHaveBeenCalledWith(SUBJECT_ID);

    const pipeline = aggregate.mock.calls[0]?.[0];
    expect(pipeline?.[0]).toEqual({
      $match: {
        subjectId: SUBJECT_ID,
        moderationState: 'available',
        state: { $in: ['open', 'closed'] },
        acceptedAnswerId: { $type: 'string' },
      },
    });
    expect(pipeline?.[1]).toEqual({ $sort: { createdAt: -1, id: 1 } });
    expect(pipeline?.[2]).toEqual({
      $lookup: {
        from: 'answers',
        let: { questionId: '$id', acceptedId: '$acceptedAnswerId' },
        pipeline: [
          {
            $match: {
              moderationState: 'available',
              $expr: {
                $and: [
                  { $eq: ['$questionId', '$$questionId'] },
                  { $eq: ['$id', '$$acceptedId'] },
                ],
              },
            },
          },
          { $project: { _id: 0, id: 1 } },
          { $limit: 1 },
        ],
        as: 'acceptedVisible',
      },
    });
    expect(pipeline?.[3]).toEqual({
      $match: { 'acceptedVisible.0': { $exists: true } },
    });
    expect(pipeline?.[4]).toEqual({
      $project: {
        _id: 0,
        questionId: '$id',
        subjectId: 1,
        title: 1,
        createdAt: 1,
        acceptedAnswerId: { $arrayElemAt: ['$acceptedVisible.id', 0] },
      },
    });
    expect(pipeline?.[5]).toEqual({
      $limit: QA_SOLVED_LIBRARY_PAGE_SIZE + 1,
    });
    expect(option).toHaveBeenCalledWith({ maxTimeMS: 5000 });
  });

  it('returns an empty page when no visible accepted answer exists', async () => {
    const { service } = fixture([]);
    const result = await service.forSubject('viewer', SUBJECT_ID, undefined);
    expect(result).toEqual({ items: [], nextCursor: null });
  });

  it('creates a session-and-subject scoped cursor from the fifteenth row', async () => {
    const { service } = fixture(
      Array.from({ length: 16 }, (_, index) => card(index)),
    );
    const result = await service.forSubject('viewer', SUBJECT_ID, undefined);
    expect(result.items).toHaveLength(15);
    expect(result.nextCursor).not.toBeNull();
    expect(
      decodeSolvedQaCursor(result.nextCursor, SUBJECT_ID, 'viewer'),
    ).toEqual({
      createdAt: DATE,
      questionId: QUESTION_IDS[14],
    });
    expect(() =>
      decodeSolvedQaCursor(result.nextCursor, OTHER_SUBJECT, 'viewer'),
    ).toThrow(UnprocessableEntityException);
  });

  it('filters the keyset before the accepted answer lookup', async () => {
    const { service, aggregate } = fixture([]);
    const cursor = encodeSolvedQaCursor(
      { createdAt: DATE, questionId: QUESTION_IDS[1] ?? '' },
      SUBJECT_ID,
      'viewer',
    );
    await service.forSubject('viewer', SUBJECT_ID, cursor);
    const pipeline = aggregate.mock.calls[0]?.[0];
    expect(pipeline?.[0]).toEqual({
      $match: {
        subjectId: SUBJECT_ID,
        moderationState: 'available',
        state: { $in: ['open', 'closed'] },
        acceptedAnswerId: { $type: 'string' },
        $or: [
          { createdAt: { $lt: DATE } },
          { createdAt: DATE, id: { $gt: QUESTION_IDS[1] } },
        ],
      },
    });
  });

  it('rejects cross-user cursors before touching Mongo', async () => {
    const { service, aggregate } = fixture([]);
    const token = encodeSolvedQaCursor(
      { createdAt: DATE, questionId: QUESTION_IDS[0] ?? '' },
      SUBJECT_ID,
      'someone-else',
    );
    const response = service.forSubject('viewer', SUBJECT_ID, token);
    await expect(response).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(aggregate).not.toHaveBeenCalled();
  });

  it.each([
    { change: { questionId: 'wrong' } },
    { change: { subjectId: OTHER_SUBJECT } },
    { change: { title: '' } },
    { change: { title: ' '.repeat(3) } },
    { change: { title: 'x'.repeat(181) } },
    { change: { acceptedAnswerId: '' } },
    { change: { createdAt: 'invalid' } },
    { change: { createdAt: new Date('invalid') } },
  ])('fails closed for malformed aggregation rows', async ({ change }) => {
    const { service } = fixture([card(0, change)]);
    const response = service.forSubject('viewer', SUBJECT_ID, undefined);
    await expect(response).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects duplicate, misordered and oversized aggregation results', async () => {
    for (const rows of [
      [card(0), card(0)],
      [card(1), card(0)],
      Array.from({ length: 17 }, (_, index) => card(index)),
    ]) {
      const { service } = fixture(rows);
      const response = service.forSubject('viewer', SUBJECT_ID, undefined);
      await expect(response).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    }
  });

  it('does not disguise Mongo failures as an empty library', async () => {
    const { service, exec } = fixture([]);
    exec.mockRejectedValue(new Error('Mongo unavailable'));
    await expect(
      service.forSubject('viewer', SUBJECT_ID, undefined),
    ).rejects.toThrow('Mongo unavailable');
  });
});
