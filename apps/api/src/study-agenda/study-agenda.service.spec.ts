import { ServiceUnavailableException } from '@nestjs/common';
import type { Model } from 'mongoose';

import { StudyProgress } from '../study-progress/mongo/study-progress.schema';
import {
  StudyAgendaService,
  STUDY_AGENDA_SUBJECT_LIMIT,
} from './study-agenda.service';

const SUBJECT_IDS = Array.from(
  { length: 18 },
  (_, index) =>
    'b14211d1-6f33-4e14-a946-' + String(index + 1).padStart(12, '0'),
);
const TASK_IDS = [
  '269f2da7-f70c-418d-9151-000000000001',
  '269f2da7-f70c-418d-9151-000000000002',
];

function stored(
  index: number,
  startsAt: string | null,
  updatedAt = new Date('2026-10-20T18:00:00.000Z'),
) {
  return {
    ownerUserId: 'session-owner',
    subjectId: SUBJECT_IDS[index],
    revision: 3,
    updatedAt,
    plan: {
      format: 'losapuntes.study-session',
      version: 1,
      subjectId: SUBJECT_IDS[index],
      title: 'Preparar segundo parcial',
      notes: 'Private notes never leave the service',
      startsAt,
      tasks: [
        { kind: 'resource', id: TASK_IDS[0], minutes: 30, done: true },
        { kind: 'question', id: TASK_IDS[1], minutes: 45, done: false },
      ],
    },
  };
}

function fixture(rows: unknown) {
  const exec = jest.fn().mockResolvedValue(rows);
  const lean = jest.fn().mockReturnValue({ exec });
  const maxTimeMS = jest.fn().mockReturnValue({ lean });
  const limit = jest.fn().mockReturnValue({ maxTimeMS });
  const select = jest.fn().mockReturnValue({ limit });
  const find = jest.fn().mockReturnValue({ select });
  const service = new StudyAgendaService({
    find,
  } as unknown as Model<StudyProgress>);
  return { service, find, select, limit, maxTimeMS, lean, exec };
}

describe('B170 private saved study session agenda', () => {
  it('groups scheduled and unscheduled plans, preserving local wall times', async () => {
    const { service } = fixture([
      stored(2, null, new Date('2026-10-20T18:00:00.000Z')),
      stored(1, '2026-11-03T09:00'),
      stored(0, '2026-10-21T21:30'),
      stored(3, null, new Date('2026-10-21T06:00:00.000Z')),
    ]);
    const result = await service.forOwner('session-owner');

    expect(result.scheduled.map((x) => x.subjectId)).toEqual([
      SUBJECT_IDS[0],
      SUBJECT_IDS[1],
    ]);
    expect(result.unscheduled.map((x) => x.subjectId)).toEqual([
      SUBJECT_IDS[3],
      SUBJECT_IDS[2],
    ]);
    expect(result.scheduled[0]).toEqual({
      subjectId: SUBJECT_IDS[0],
      revision: 3,
      updatedAt: '2026-10-20T18:00:00.000Z',
      title: 'Preparar segundo parcial',
      startsAt: '2026-10-21T21:30',
      tasks: { total: 2, completed: 1, pending: 1 },
      minutes: { planned: 75, completed: 30, remaining: 45 },
    });
    expect(JSON.stringify(result)).not.toContain('Private notes');
    expect(JSON.stringify(result)).not.toContain(TASK_IDS[0]);
    expect(JSON.stringify(result)).not.toContain(TASK_IDS[1]);
  });

  it('uses a single limited owner-only read, without joining other accounts', async () => {
    const { service, find, select, limit, maxTimeMS, lean } = fixture([]);
    await expect(service.forOwner('session-owner')).resolves.toEqual({
      scheduled: [],
      unscheduled: [],
    });
    expect(find).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledWith({ ownerUserId: 'session-owner' });
    expect(select).toHaveBeenCalledWith({
      _id: 0,
      ownerUserId: 1,
      subjectId: 1,
      revision: 1,
      updatedAt: 1,
      plan: 1,
    });
    expect(limit).toHaveBeenCalledWith(STUDY_AGENDA_SUBJECT_LIMIT + 1);
    expect(maxTimeMS).toHaveBeenCalledWith(5000);
    expect(lean).toHaveBeenCalledTimes(1);
  });

  it('keeps empty-task plans visible without inventing a completed session', async () => {
    const row = stored(0, '2026-10-21T09:00');
    row.plan.tasks = [];
    const { service } = fixture([row]);
    const result = await service.forOwner('session-owner');
    expect(result.scheduled[0]?.tasks).toEqual({
      total: 0,
      completed: 0,
      pending: 0,
    });
    expect(result.scheduled[0]?.minutes).toEqual({
      planned: 0,
      completed: 0,
      remaining: 0,
    });
  });

  it('sorts equal scheduled dates and undated updates deterministically', async () => {
    const date = new Date('2026-10-20T18:00:00.000Z');
    const { service } = fixture([
      stored(3, null, date),
      stored(2, null, date),
      stored(1, '2026-11-03T09:00'),
      stored(0, '2026-11-03T09:00'),
    ]);
    const result = await service.forOwner('session-owner');
    expect(result.scheduled.map((x) => x.subjectId)).toEqual([
      SUBJECT_IDS[0],
      SUBJECT_IDS[1],
    ]);
    expect(result.unscheduled.map((x) => x.subjectId)).toEqual([
      SUBJECT_IDS[2],
      SUBJECT_IDS[3],
    ]);
  });

  it.each([
    { name: 'foreign owner', mutate: (row: ReturnType<typeof stored>) => ({ ...row, ownerUserId: 'foreign' }) },
    { name: 'bad subject ID', mutate: (row: ReturnType<typeof stored>) => ({ ...row, subjectId: 'bad' }) },
    { name: 'invalid revision', mutate: (row: ReturnType<typeof stored>) => ({ ...row, revision: 0 }) },
    { name: 'invalid updatedAt', mutate: (row: ReturnType<typeof stored>) => ({ ...row, updatedAt: new Date('bad') }) },
    { name: 'invalid plan title', mutate: (row: ReturnType<typeof stored>) => ({ ...row, plan: { ...row.plan, title: '' } }) },
    { name: 'cross-subject plan', mutate: (row: ReturnType<typeof stored>) => ({ ...row, plan: { ...row.plan, subjectId: SUBJECT_IDS[1] } }) },
    { name: 'unexpected extra fields in plan', mutate: (row: ReturnType<typeof stored>) => ({ ...row, plan: { ...row.plan, token: 'secret' } }) },
    { name: 'malformed start time', mutate: (row: ReturnType<typeof stored>) => ({ ...row, plan: { ...row.plan, startsAt: 'yesterday' } }) },
  ])('rejects $name instead of emitting a partial agenda', async ({ mutate }) => {
    const { service } = fixture([mutate(stored(0, null))]);
    await expect(service.forOwner('session-owner')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects duplicate subjects even when Mongo returns a bounded result', async () => {
    const { service } = fixture([stored(0, null), stored(0, null)]);
    await expect(service.forOwner('session-owner')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects legacy rows above the storage limit instead of truncating', async () => {
    const { service } = fixture(
      SUBJECT_IDS.slice(0, 17).map((_, index) => stored(index, null)),
    );
    await expect(service.forOwner('session-owner')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('propagates Mongo failures rather than fabricating an empty agenda', async () => {
    const { service, exec } = fixture([]);
    exec.mockRejectedValue(new Error('Mongo unavailable'));
    await expect(service.forOwner('session-owner')).rejects.toThrow(
      'Mongo unavailable',
    );
  });
});
