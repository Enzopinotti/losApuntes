import {
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { StudySessionSummaryService } from './study-session-summary.service';

const subject = '11111111-1111-4111-8111-111111111111';
const resource = '22222222-2222-4222-8222-222222222222';
const question = '33333333-3333-4333-8333-333333333333';
const last = '44444444-4444-4444-8444-444444444444';
const updatedAt = new Date('2026-10-20T12:03:00.000Z');

function task(
  kind: 'question' | 'resource',
  id: string,
  minutes: number,
  done: unknown,
) {
  return { kind, id, minutes, done };
}

function plan(
  tasks: unknown[] = [
    task('resource', resource, 30, true),
    task('question', question, 25, false),
    task('resource', last, 15, false),
  ],
) {
  return {
    format: 'losapuntes.study-session',
    version: 1,
    subjectId: subject,
    title: 'Preparar el parcial',
    notes: 'Private study notes that must not leak',
    startsAt: null,
    tasks,
  };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    ownerUserId: 'student-a',
    subjectId: subject,
    revision: 4,
    updatedAt,
    plan: plan(),
    secret: 'hidden',
    ...overrides,
  };
}

function fixture(saved: unknown = row()) {
  const exec = jest.fn().mockResolvedValue(saved);
  const lean = jest.fn().mockReturnValue({ exec });
  const select = jest.fn().mockReturnValue({ lean });
  const findOne = jest.fn().mockReturnValue({ select });
  const service = new StudySessionSummaryService({ findOne } as never);
  return { service, findOne, select, lean, exec };
}

describe('B157 owner-scoped Study Session summary', () => {
  it('computes complete, pending, percentage and next task in authored order', async () => {
    const f = fixture();
    const result = await f.service.get('student-a', subject);
    expect(f.findOne).toHaveBeenCalledWith({
      ownerUserId: 'student-a',
      subjectId: subject,
    });
    expect(f.select).toHaveBeenCalledWith({
      _id: 0,
      ownerUserId: 1,
      subjectId: 1,
      revision: 1,
      updatedAt: 1,
      plan: 1,
    });
    expect(result).toEqual({
      subjectId: subject,
      revision: 4,
      updatedAt: updatedAt.toISOString(),
      tasks: { total: 3, completed: 1, pending: 2 },
      minutes: { planned: 70, completed: 30, remaining: 40 },
      completionPercent: 33,
      nextTask: { kind: 'question', id: question, minutes: 25 },
    });
    expect(JSON.stringify(result)).not.toContain('student-a');
    expect(JSON.stringify(result)).not.toContain('Private study notes');
    expect(JSON.stringify(result)).not.toContain('hidden');
    expect(JSON.stringify(result)).not.toContain(resource);
  });

  it('represents a completed session as 100 percent without a next task', async () => {
    const f = fixture(
      row({
        plan: plan([
          task('resource', resource, 35, true),
          task('question', question, 20, true),
        ]),
      }),
    );
    await expect(f.service.get('student-a', subject)).resolves.toMatchObject({
      tasks: { total: 2, completed: 2, pending: 0 },
      minutes: { planned: 55, completed: 55, remaining: 0 },
      completionPercent: 100,
      nextTask: null,
    });
  });

  it('represents an empty saved plan as zero completion, not 100 percent', async () => {
    const f = fixture(row({ plan: plan([]) }));
    await expect(f.service.get('student-a', subject)).resolves.toMatchObject({
      tasks: { total: 0, completed: 0, pending: 0 },
      minutes: { planned: 0, completed: 0, remaining: 0 },
      completionPercent: 0,
      nextTask: null,
    });
  });

  it('returns first unfinished task after earlier completed tasks', async () => {
    const f = fixture(
      row({
        plan: plan([
          task('resource', resource, 15, false),
          task('question', question, 35, true),
        ]),
      }),
    );
    const summary = await f.service.get('student-a', subject);
    expect(summary.nextTask).toEqual({
      kind: 'resource',
      id: resource,
      minutes: 15,
    });
    expect(summary.minutes.remaining).toBe(15);
  });

  it('preserves the same owner-scoped 404 when subject progress does not exist', async () => {
    const f = fixture(null);
    await expect(f.service.get('student-a', subject)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects unauthenticated or invalid-subject internal calls before Mongo', async () => {
    const f = fixture();
    for (const owner of ['', '   ']) {
      await expect(f.service.get(owner, subject)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    }
    await expect(f.service.get('student-a', 'not-uuid')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(f.findOne).not.toHaveBeenCalled();
  });

  it('fails closed on wrong owner, wrong subject, invalid revision or updatedAt', async () => {
    for (const changes of [
      { ownerUserId: 'other-student' },
      { subjectId: question },
      { revision: 0 },
      { revision: 1.5 },
      { revision: '3' },
      { updatedAt: 'not-a-date' },
      { updatedAt: new Date(Number.NaN) },
    ]) {
      const f = fixture(row(changes));
      await expect(f.service.get('student-a', subject)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    }
  });

  it('rejects malformed stored Study Session v1 plans without exposing them', async () => {
    for (const storedPlan of [
      null,
      {},
      { ...plan(), format: 'unknown' },
      { ...plan(), subjectId: question },
      { ...plan(), tasks: [task('resource', resource, 7, true)] },
      {
        ...plan(),
        tasks: [
          task('resource', resource, 30, true),
          task('resource', resource, 30, false),
        ],
      },
      { ...plan(), tasks: [task('question', question, 30, 'yes')] },
      { ...plan(), extra: 'secret' },
    ]) {
      const f = fixture(row({ plan: storedPlan }));
      await expect(f.service.get('student-a', subject)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    }
  });

  it('propagates Mongo failures instead of fabricating zero progress', async () => {
    const f = fixture();
    f.exec.mockRejectedValue(new Error('mongo-offline'));
    await expect(f.service.get('student-a', subject)).rejects.toThrow(
      'mongo-offline',
    );
  });
});
