import { UnprocessableEntityException } from '@nestjs/common';
import { parseStudyProgressPlan } from './study-progress.plan';

const subject = 'c1598053-cec3-46c2-a9ce-d5d7ddcae8bd';
const resource = '2b10b715-7cc0-428b-a984-dd7a7064dd90';
const question = 'd8c10227-b705-4928-bf05-b26ca82d259b';
const valid = {
  format: 'losapuntes.study-session',
  version: 1,
  subjectId: subject,
  title: ' Preparar parcial ',
  notes: 'Mi progreso',
  startsAt: null,
  tasks: [
    { kind: 'resource', id: resource, minutes: 15, done: false },
    { kind: 'question', id: question, minutes: 20, done: true },
  ],
};
describe('B61 study progress portable plan integrity', () => {
  it('returns a sanitized immutable-projection-compatible v1 plan', () => {
    const result = parseStudyProgressPlan(valid, subject);
    expect(result.title).toBe('Preparar parcial');
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[1]?.done).toBe(true);
    expect(result.subjectId).toBe(subject);
    expect(Object.keys(result).sort()).toEqual([
      'format',
      'notes',
      'startsAt',
      'subjectId',
      'tasks',
      'title',
      'version',
    ]);
  });
  it('rejects cross-subject authority and noncanonical data', () => {
    for (const payload of [
      { ...valid, subjectId: resource },
      { ...valid, token: 'secret' },
      { ...valid, notes: 'a'.repeat(501) },
      { ...valid, title: '  ' },
      { ...valid, title: 'a'.repeat(101) },
      { ...valid, version: 2 },
      {
        ...valid,
        tasks: [{ ...valid.tasks[0], accessUrl: 'https://private.example' }],
      },
      { ...valid, tasks: [valid.tasks[0], valid.tasks[0]] },
      { ...valid, tasks: Array.from({ length: 25 }, () => valid.tasks[0]) },
      { ...valid, tasks: [{ ...valid.tasks[0], done: 'yes' }] },
      { ...valid, tasks: [{ ...valid.tasks[0], minutes: 121 }] },
      { ...valid, tasks: [{ ...valid.tasks[0], minutes: 17 }] },
      { ...valid, startsAt: '2026-02-31T12:00' },
    ]) {
      expect(() => parseStudyProgressPlan(payload, subject)).toThrow(
        UnprocessableEntityException,
      );
    }
  });
  it('rejects unknown and duplicate ids across kind and subject', () => {
    expect(() =>
      parseStudyProgressPlan(
        {
          ...valid,
          tasks: [{ ...valid.tasks[0], id: 'not-a-uuid' }],
        },
        subject,
      ),
    ).toThrow(UnprocessableEntityException);
    expect(() => parseStudyProgressPlan(valid, resource)).toThrow(
      UnprocessableEntityException,
    );
  });
});
