import { ServiceUnavailableException } from '@nestjs/common';
import type { Model } from 'mongoose';

import { AcademicSubjectParticipation } from '../academic/mongo/academic.mongo-schemas';
import { Question } from '../qa/mongo/qa.mongo-schemas';
import {
  QaHelpOpportunitiesService,
  QA_HELP_SUBJECT_LIMIT,
} from './qa-help-opportunities.service';

const SUBJECT_IDS = Array.from(
  { length: 14 },
  (_, index) =>
    'b14211d1-6f33-4e14-a946-' + String(index + 1).padStart(12, '0'),
);

function fixture(participationRows: unknown[], questionRows: unknown[]) {
  const participationExec = jest.fn().mockResolvedValue(participationRows);
  const questionExec = jest.fn().mockResolvedValue(questionRows);
  const participationOption = jest
    .fn()
    .mockReturnValue({ exec: participationExec });
  const questionOption = jest.fn().mockReturnValue({ exec: questionExec });
  const participationAggregate = jest
    .fn<unknown, [unknown[]]>()
    .mockReturnValue({ option: participationOption });
  const questionAggregate = jest
    .fn<unknown, [unknown[]]>()
    .mockReturnValue({ option: questionOption });

  const service = new QaHelpOpportunitiesService(
    { aggregate: participationAggregate } as unknown as Model<AcademicSubjectParticipation>,
    { aggregate: questionAggregate } as unknown as Model<Question>,
  );
  return {
    service,
    participationAggregate,
    questionAggregate,
    participationOption,
    questionOption,
    participationExec,
    questionExec,
  };
}

describe('B167 private current-subject help opportunities', () => {
  it('returns ranked counts with explicit zeros and without question details', async () => {
    const { service } = fixture(
      [{ subjectId: SUBJECT_IDS[0] }, { subjectId: SUBJECT_IDS[1] }],
      [{ subjectId: SUBJECT_IDS[0], count: 4 }],
    );
    await expect(service.forOwner('signed-in-user')).resolves.toEqual({
      items: [
        { subjectId: SUBJECT_IDS[0], unansweredPeerQuestions: 4 },
        { subjectId: SUBJECT_IDS[1], unansweredPeerQuestions: 0 },
      ],
      hasMoreSubjects: false,
    });
  });

  it('derives current subjects exclusively from owner participation', async () => {
    const {
      service,
      participationAggregate,
      questionAggregate,
      participationOption,
      questionOption,
    } = fixture([{ subjectId: SUBJECT_IDS[0] }], []);
    await service.forOwner('signed-in-user');

    expect(participationAggregate.mock.calls[0]?.[0]).toEqual([
      { $match: { userId: 'signed-in-user', state: 'current' } },
      {
        $group: {
          _id: '$subjectId',
          lastParticipationUpdate: { $max: '$updatedAt' },
        },
      },
      { $sort: { lastParticipationUpdate: -1, _id: 1 } },
      { $limit: QA_HELP_SUBJECT_LIMIT + 1 },
      { $project: { _id: 0, subjectId: '$_id' } },
    ]);
    expect(questionAggregate.mock.calls[0]?.[0]).toEqual([
      {
        $match: {
          subjectId: { $in: [SUBJECT_IDS[0]] },
          state: 'open',
          moderationState: 'available',
          authorUserId: { $ne: 'signed-in-user' },
        },
      },
      {
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
      },
      { $match: { 'visibleAnswers.0': { $exists: false } } },
      { $group: { _id: '$subjectId', count: { $sum: 1 } } },
      { $project: { _id: 0, subjectId: '$_id', count: 1 } },
      { $limit: QA_HELP_SUBJECT_LIMIT + 1 },
    ]);
    expect(participationOption).toHaveBeenCalledWith({ maxTimeMS: 5000 });
    expect(questionOption).toHaveBeenCalledWith({ maxTimeMS: 5000 });
    expect(participationAggregate).toHaveBeenCalledTimes(1);
    expect(questionAggregate).toHaveBeenCalledTimes(1);
  });

  it('skips querying Q&A if the student has no current subjects', async () => {
    const { service, questionAggregate } = fixture([], []);
    await expect(service.forOwner('new-student')).resolves.toEqual({
      items: [],
      hasMoreSubjects: false,
    });
    expect(questionAggregate).not.toHaveBeenCalled();
  });

  it('caps the preview to twelve distinct subjects and flags more', async () => {
    const { service, questionAggregate } = fixture(
      SUBJECT_IDS.slice(0, 13).map((subjectId) => ({ subjectId })),
      [],
    );
    const result = await service.forOwner('student');
    expect(result.items).toHaveLength(12);
    expect(result.hasMoreSubjects).toBe(true);
    const pipeline = questionAggregate.mock.calls[0]?.[0];
    expect(pipeline?.[0]).toEqual({
      $match: {
        subjectId: { $in: SUBJECT_IDS.slice(0, 12) },
        state: 'open',
        moderationState: 'available',
        authorUserId: { $ne: 'student' },
      },
    });
  });

  it('orders equal counts by subject ID deterministically', async () => {
    const { service } = fixture(
      [{ subjectId: SUBJECT_IDS[1] }, { subjectId: SUBJECT_IDS[0] }],
      [
        { subjectId: SUBJECT_IDS[1], count: 3 },
        { subjectId: SUBJECT_IDS[0], count: 3 },
      ],
    );
    const result = await service.forOwner('student');
    expect(result.items.map((row) => row.subjectId)).toEqual([
      SUBJECT_IDS[0],
      SUBJECT_IDS[1],
    ]);
  });

  it.each([
    [[{ subjectId: '' }], []],
    [[{ subjectId: 'not-uuid' }], []],
    [[{ subjectId: SUBJECT_IDS[0] }, { subjectId: SUBJECT_IDS[0] }], []],
    [SUBJECT_IDS.map((subjectId) => ({ subjectId })), []],
    [[{ subjectId: SUBJECT_IDS[0] }], [{ subjectId: SUBJECT_IDS[1], count: 2 }]],
    [[{ subjectId: SUBJECT_IDS[0] }], [{ subjectId: SUBJECT_IDS[0], count: 0 }]],
    [[{ subjectId: SUBJECT_IDS[0] }], [{ subjectId: SUBJECT_IDS[0], count: -1 }]],
    [[{ subjectId: SUBJECT_IDS[0] }], [{ subjectId: SUBJECT_IDS[0], count: 2.5 }]],
    [[{ subjectId: SUBJECT_IDS[0] }], [{ subjectId: SUBJECT_IDS[0], count: '2' }]],
    [[{ subjectId: SUBJECT_IDS[0] }], [{ subjectId: SUBJECT_IDS[0], count: Number.MAX_SAFE_INTEGER + 1 }]],
    [[{ subjectId: SUBJECT_IDS[0] }], [
      { subjectId: SUBJECT_IDS[0], count: 1 },
      { subjectId: SUBJECT_IDS[0], count: 2 },
    ]],
  ])('fails closed on corrupt subject or count aggregates', async (subjects, counts) => {
    const { service } = fixture(subjects, counts);
    await expect(service.forOwner('student')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('does not hide Mongo failures as zero unanswered questions', async () => {
    const { service, questionExec } = fixture(
      [{ subjectId: SUBJECT_IDS[0] }],
      [],
    );
    questionExec.mockRejectedValue(new Error('Mongo unavailable'));
    await expect(service.forOwner('student')).rejects.toThrow(
      'Mongo unavailable',
    );
  });
});
