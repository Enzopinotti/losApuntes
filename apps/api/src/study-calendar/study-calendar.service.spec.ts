import { ServiceUnavailableException } from '@nestjs/common';
import type { Model } from 'mongoose';

import { StudyProgress } from '../study-progress/mongo/study-progress.schema';
import {
  StudyCalendarService,
  STUDY_CALENDAR_SUBJECT_LIMIT,
} from './study-calendar.service';

const SUBJECT_IDS = Array.from(
  { length: 18 },
  (_, index) =>
    'b14211d1-6f33-4e14-a946-' + String(index + 1).padStart(12, '0'),
);
const RESOURCE = '269f2da7-f70c-418d-9151-000000000001';
const QUESTION = '269f2da7-f70c-418d-9151-000000000002';

function stored(
  index: number,
  startsAt: string | null,
  options: Record<string, unknown> = {},
) {
  return {
    ownerUserId: 'signed-in-student',
    subjectId: SUBJECT_IDS[index],
    revision: 2,
    updatedAt: new Date('2026-10-20T18:00:00.000Z'),
    plan: {
      format: 'losapuntes.study-session',
      version: 1,
      subjectId: SUBJECT_IDS[index],
      title: 'Repasar final',
      notes: 'No compartir estas notas',
      startsAt,
      tasks: [
        { kind: 'resource', id: RESOURCE, minutes: 30, done: true },
        { kind: 'question', id: QUESTION, minutes: 45, done: false },
      ],
    },
    ...options,
  };
}

function fixture(rows: unknown) {
  const exec = jest.fn().mockResolvedValue(rows);
  const lean = jest.fn().mockReturnValue({ exec });
  const maxTimeMS = jest.fn().mockReturnValue({ lean });
  const limit = jest.fn().mockReturnValue({ maxTimeMS });
  const select = jest.fn().mockReturnValue({ limit });
  const find = jest.fn().mockReturnValue({ select });
  const service = new StudyCalendarService({
    find,
  } as unknown as Model<StudyProgress>);
  return { service, find, select, limit, maxTimeMS, lean, exec };
}

describe('B173 private study session calendar export', () => {
  it('exports scheduled sessions only, in ascending local date order', async () => {
    const rows = [
      stored(1, '2026-11-15T18:00'),
      stored(2, null),
      stored(0, '2026-10-23T09:00'),
    ];
    const { service } = fixture(rows);
    const output = await service.forOwner('signed-in-student');
    expect(output.match(/BEGIN:VEVENT/gmu)).toHaveLength(2);
    expect(output.indexOf('DTSTART:20261023T090000')).toBeLessThan(
      output.indexOf('DTSTART:20261115T180000'),
    );
    expect(output.match(/DURATION:PT75M/gmu)).toHaveLength(2);
    expect(output).not.toContain('No compartir estas notas');
    expect(output).not.toContain(RESOURCE);
    expect(output).not.toContain(QUESTION);
    expect(output).not.toContain(SUBJECT_IDS[0]);
    expect(output).not.toContain('signed-in-student');
  });

  it('ignores undated and zero-task plans without inventing duration', async () => {
    const empty = stored(1, '2026-11-15T18:00');
    empty.plan.tasks = [];
    const { service } = fixture([stored(0, null), empty]);
    const output = await service.forOwner('signed-in-student');
    expect(output).toContain('BEGIN:VCALENDAR');
    expect(output).not.toContain('BEGIN:VEVENT');
    expect(output).not.toContain('DURATION:PT0M');
  });

  it('uses a single bounded owner-only query and no extra lookups', async () => {
    const { service, find, select, limit, maxTimeMS, lean } = fixture([]);
    await expect(service.forOwner('signed-in-student')).resolves.toContain(
      'END:VCALENDAR\r\n',
    );
    expect(find).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledWith({ ownerUserId: 'signed-in-student' });
    expect(select).toHaveBeenCalledWith({
      _id: 0,
      ownerUserId: 1,
      subjectId: 1,
      revision: 1,
      updatedAt: 1,
      plan: 1,
    });
    expect(limit).toHaveBeenCalledWith(STUDY_CALENDAR_SUBJECT_LIMIT + 1);
    expect(maxTimeMS).toHaveBeenCalledWith(5000);
    expect(lean).toHaveBeenCalledTimes(1);
  });

  it('exports completed plans as calendar events without changing progress', async () => {
    const record = stored(0, '2026-11-10T08:00');
    record.plan.tasks.forEach((task) => {
      task.done = true;
    });
    const { service } = fixture([record]);
    const output = await service.forOwner('signed-in-student');
    expect(output).toContain('DTSTART:20261110T080000');
    expect(output).toContain('DURATION:PT75M');
  });

  it.each([
    { name: 'wrong owner', patch: { ownerUserId: 'another' } },
    { name: 'unknown subject', patch: { subjectId: 'bad' } },
    { name: 'revision zero', patch: { revision: 0 } },
    { name: 'unsafe revision', patch: { revision: 2147483648 } },
    { name: 'updatedAt missing', patch: { updatedAt: null } },
    { name: 'invalid updatedAt', patch: { updatedAt: new Date('bad') } },
    { name: 'missing plan', patch: { plan: null } },
    {
      name: 'corrupt stored title',
      patch: {
        plan: {
          format: 'losapuntes.study-session',
          version: 1,
          title: 'Bad\r\nBEGIN:VEVENT',
        },
      },
    },
  ])('fails closed on $name without a partial calendar', async ({ patch }) => {
    const { service } = fixture([stored(0, '2026-11-03T09:00', patch)]);
    await expect(service.forOwner('signed-in-student')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects duplicate subjects even if both have no date', async () => {
    const { service } = fixture([stored(0, null), stored(0, null)]);
    await expect(service.forOwner('signed-in-student')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects excess stored subjects rather than silently truncating', async () => {
    const { service } = fixture(
      SUBJECT_IDS.slice(0, 17).map((_, index) => stored(index, null)),
    );
    await expect(service.forOwner('signed-in-student')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('propagates Mongo failures rather than returning an empty calendar', async () => {
    const { service, exec } = fixture([]);
    exec.mockRejectedValue(new Error('Mongo unavailable'));
    await expect(service.forOwner('signed-in-student')).rejects.toThrow(
      'Mongo unavailable',
    );
  });
});
