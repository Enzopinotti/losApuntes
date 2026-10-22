import { ServiceUnavailableException } from '@nestjs/common';
import type { Model } from 'mongoose';

import { StudyProgress } from '../study-progress/mongo/study-progress.schema';
import {
  StudyNextActionsService,
  STUDY_NEXT_ACTION_SUBJECT_LIMIT,
} from './study-next-actions.service';

const SUBJECT_IDS = Array.from(
  { length: 18 },
  (_, index) =>
    'b14211d1-6f33-4e14-a946-' + String(index + 1).padStart(12, '0'),
);
const RESOURCE_ID = '269f2da7-f70c-418d-9151-000000000001';
const QUESTION_ID = '269f2da7-f70c-418d-9151-000000000002';
const SECOND_RESOURCE_ID = '269f2da7-f70c-418d-9151-000000000003';

function stored(
  index: number,
  startsAt: string | null,
  changes: Record<string, unknown> = {},
) {
  return {
    ownerUserId: 'session-owner',
    subjectId: SUBJECT_IDS[index],
    revision: 2,
    updatedAt: new Date('2026-10-21T11:00:00.000Z'),
    plan: {
      format: 'losapuntes.study-session',
      version: 1,
      subjectId: SUBJECT_IDS[index],
      title: 'Repasar para el examen',
      notes: 'Secreto de planificación que nunca sale del backend',
      startsAt,
      tasks: [
        { kind: 'resource', id: RESOURCE_ID, minutes: 30, done: true },
        { kind: 'question', id: QUESTION_ID, minutes: 45, done: false },
        { kind: 'resource', id: SECOND_RESOURCE_ID, minutes: 20, done: false },
      ],
    },
    ...changes,
  };
}

function fixture(rows: unknown) {
  const exec = jest.fn().mockResolvedValue(rows);
  const lean = jest.fn().mockReturnValue({ exec });
  const maxTimeMS = jest.fn().mockReturnValue({ lean });
  const limit = jest.fn().mockReturnValue({ maxTimeMS });
  const select = jest.fn().mockReturnValue({ limit });
  const find = jest.fn().mockReturnValue({ select });
  const service = new StudyNextActionsService({
    find,
  } as unknown as Model<StudyProgress>);
  return { service, find, select, limit, maxTimeMS, lean, exec };
}

describe('B171 private cross-subject next study actions', () => {
  it('returns first pending task only, in local scheduled order then unscheduled', async () => {
    const late = stored(1, '2026-11-15T18:00');
    const early = stored(0, '2026-10-23T09:00');
    const undated = stored(2, null);
    const { service } = fixture([undated, late, early]);
    const result = await service.forOwner('session-owner');

    expect(result.items.map((item) => item.subjectId)).toEqual([
      SUBJECT_IDS[0],
      SUBJECT_IDS[1],
      SUBJECT_IDS[2],
    ]);
    expect(result.items[0]).toEqual({
      subjectId: SUBJECT_IDS[0],
      revision: 2,
      title: 'Repasar para el examen',
      startsAtLocal: '2026-10-23T09:00',
      updatedAt: '2026-10-21T11:00:00.000Z',
      pendingTasks: 2,
      remainingMinutes: 65,
      nextTask: {
        kind: 'question',
        id: QUESTION_ID,
        minutes: 45,
      },
    });
    expect(result.summary).toEqual({
      totalPlans: 3,
      actionablePlans: 3,
      completedPlans: 0,
      emptyPlans: 0,
    });
    expect(JSON.stringify(result)).not.toContain('Secreto de planificación');
    expect(JSON.stringify(result)).not.toContain(RESOURCE_ID);
  });

  it('distinguishes completed and empty plans without inventing next tasks', async () => {
    const completed = stored(0, '2026-10-22T09:00');
    completed.plan.tasks.forEach((task) => {
      task.done = true;
    });
    const empty = stored(1, null);
    empty.plan.tasks = [];
    const { service } = fixture([completed, empty, stored(2, null)]);
    const result = await service.forOwner('session-owner');

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.subjectId).toBe(SUBJECT_IDS[2]);
    expect(result.summary).toEqual({
      totalPlans: 3,
      actionablePlans: 1,
      completedPlans: 1,
      emptyPlans: 1,
    });
  });

  it('reads only current session owner and enforces the 16+1 detection bound', async () => {
    const { service, find, select, limit, maxTimeMS, lean } = fixture([]);
    await expect(service.forOwner('authenticated-owner')).resolves.toEqual({
      items: [],
      summary: {
        totalPlans: 0,
        actionablePlans: 0,
        completedPlans: 0,
        emptyPlans: 0,
      },
    });
    expect(find).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledWith({
      ownerUserId: 'authenticated-owner',
    });
    expect(select).toHaveBeenCalledWith({
      _id: 0,
      ownerUserId: 1,
      subjectId: 1,
      revision: 1,
      updatedAt: 1,
      plan: 1,
    });
    expect(limit).toHaveBeenCalledWith(STUDY_NEXT_ACTION_SUBJECT_LIMIT + 1);
    expect(maxTimeMS).toHaveBeenCalledWith(5000);
    expect(lean).toHaveBeenCalledTimes(1);
  });

  it('sorts undated actions by latest update then subject and ties scheduled by subject', async () => {
    const updated = new Date('2026-10-21T14:00:00.000Z');
    const older = new Date('2026-10-20T17:00:00.000Z');
    const rows = [
      stored(3, null, { updatedAt: updated }),
      stored(2, null, { updatedAt: updated }),
      stored(4, null, { updatedAt: older }),
      stored(1, '2026-11-07T10:30'),
      stored(0, '2026-11-07T10:30'),
    ];
    const { service } = fixture(rows);
    const result = await service.forOwner('session-owner');
    expect(result.items.map((item) => item.subjectId)).toEqual([
      SUBJECT_IDS[0],
      SUBJECT_IDS[1],
      SUBJECT_IDS[2],
      SUBJECT_IDS[3],
      SUBJECT_IDS[4],
    ]);
  });

  it('shows only one earliest unfinished task per subject, even when earlier ones are done', async () => {
    const row = stored(0, null);
    row.plan.tasks[0].done = false;
    row.plan.tasks[1].done = true;
    row.plan.tasks[2].done = false;
    const { service } = fixture([row]);
    const result = await service.forOwner('session-owner');
    expect(result.items[0]?.nextTask).toEqual({
      kind: 'resource',
      id: RESOURCE_ID,
      minutes: 30,
    });
    expect(result.items[0]?.remainingMinutes).toBe(50);
  });

  it.each([
    {
      name: 'foreign owner',
      change: { ownerUserId: 'another-account' },
    },
    { name: 'invalid subject', change: { subjectId: 'not-uuid' } },
    { name: 'invalid revision', change: { revision: 0 } },
    {
      name: 'unsafe revision',
      change: { revision: Number.MAX_SAFE_INTEGER + 1 },
    },
    { name: 'missing date', change: { updatedAt: null } },
    { name: 'bad date', change: { updatedAt: new Date('bad') } },
    {
      name: 'malformed saved plan',
      change: { plan: { format: 'fake', version: 9 } },
    },
  ])('fails closed on $name in Mongo row', async ({ change }) => {
    const { service } = fixture([stored(0, null, change)]);
    await expect(service.forOwner('session-owner')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects a subject mismatch hidden inside the stored plan', async () => {
    const row = stored(0, null);
    row.plan.subjectId = SUBJECT_IDS[1];
    const { service } = fixture([row]);
    await expect(service.forOwner('session-owner')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('fails for duplicate saved subjects rather than returning duplicate tasks', async () => {
    const { service } = fixture([stored(0, null), stored(0, null)]);
    await expect(service.forOwner('session-owner')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('does not silently truncate 17 stored plans', async () => {
    const { service } = fixture(
      SUBJECT_IDS.slice(0, 17).map((_, index) => stored(index, null)),
    );
    await expect(service.forOwner('session-owner')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('propagates persistence failure rather than inventing an empty action queue', async () => {
    const { service, exec } = fixture([]);
    exec.mockRejectedValue(new Error('Mongo unavailable'));
    await expect(service.forOwner('session-owner')).rejects.toThrow(
      'Mongo unavailable',
    );
  });
});
