import {
  ForbiddenException,
  GoneException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Model } from 'mongoose';

import type { QaService } from '../qa/domain/qa.service';
import type { ResourceService } from '../resources/domain/resource.service';
import { StudyProgress } from '../study-progress/mongo/study-progress.schema';
import {
  StudyTaskReferenceCheckService,
  STUDY_TASK_REFERENCE_CONCURRENCY,
  STUDY_TASK_REFERENCE_MAX_CHECKS,
} from './study-task-reference-check.service';

const SUBJECT = 'b14211d1-6f33-4e14-a946-000000000001';
const FOREIGN_SUBJECT = 'b14211d1-6f33-4e14-a946-000000000002';
const RESOURCE_1 = '269f2da7-f70c-418d-9151-000000000001';
const QUESTION_1 = '269f2da7-f70c-418d-9151-000000000002';
const RESOURCE_2 = '269f2da7-f70c-418d-9151-000000000003';

function task(
  kind: 'resource' | 'question',
  id: string,
  done = false,
) {
  return { kind, id, minutes: 25, done };
}

function stored(
  tasks: Array<ReturnType<typeof task>> = [
    task('resource', RESOURCE_1),
    task('question', QUESTION_1),
    task('resource', RESOURCE_2, true),
  ],
): Record<string, unknown> {
  return {
    ownerUserId: 'current-student',
    subjectId: SUBJECT,
    revision: 3,
    plan: {
      format: 'losapuntes.study-session',
      version: 1,
      subjectId: SUBJECT,
      title: 'Preparar final',
      notes: 'Nota privada que no debe salir',
      startsAt: null,
      tasks,
    },
  };
}

function fixture(row: unknown) {
  const exec = jest.fn().mockResolvedValue(row);
  const lean = jest.fn().mockReturnValue({ exec });
  const maxTimeMS = jest.fn().mockReturnValue({ lean });
  const select = jest.fn().mockReturnValue({ maxTimeMS });
  const findOne = jest.fn().mockReturnValue({ select });
  const resourceGet = jest.fn().mockResolvedValue({ resource: {} });
  const questionGet = jest.fn().mockResolvedValue({ question: {} });
  const service = new StudyTaskReferenceCheckService(
    { findOne } as unknown as Model<StudyProgress>,
    { get: resourceGet } as unknown as ResourceService,
    { get: questionGet } as unknown as QaService,
  );
  return {
    service,
    exec,
    findOne,
    select,
    maxTimeMS,
    lean,
    resourceGet,
    questionGet,
  };
}

describe('B172 saved study task reference status', () => {
  it('reuses canonical authorization reads and skips completed tasks', async () => {
    const {
      service,
      resourceGet,
      questionGet,
      findOne,
      select,
      maxTimeMS,
    } = fixture(stored());
    resourceGet.mockRejectedValue(new NotFoundException());
    const result = await service.forOwner('current-student', SUBJECT);
    expect(result).toEqual({
      subjectId: SUBJECT,
      revision: 3,
      checked: 2,
      available: 1,
      unavailable: 1,
      items: [
        { kind: 'resource', id: RESOURCE_1, status: 'unavailable' },
        { kind: 'question', id: QUESTION_1, status: 'available' },
      ],
    });
    expect(resourceGet).toHaveBeenCalledTimes(1);
    expect(resourceGet).toHaveBeenCalledWith(RESOURCE_1, 'current-student');
    expect(questionGet).toHaveBeenCalledTimes(1);
    expect(questionGet).toHaveBeenCalledWith(QUESTION_1, 'current-student');
    expect(findOne).toHaveBeenCalledWith({
      ownerUserId: 'current-student',
      subjectId: SUBJECT,
    });
    expect(select).toHaveBeenCalledWith({
      _id: 0,
      ownerUserId: 1,
      subjectId: 1,
      revision: 1,
      plan: 1,
    });
    expect(maxTimeMS).toHaveBeenCalledWith(5000);
    expect(JSON.stringify(result)).not.toContain('Nota privada');
    expect(JSON.stringify(result)).not.toContain(RESOURCE_2);
  });

  it.each([
    { name: 'forbidden', exception: new ForbiddenException() },
    { name: 'missing', exception: new NotFoundException() },
    { name: 'gone', exception: new GoneException() },
  ])('maps $name links to identical unavailable status', async ({ exception }) => {
    const { service, questionGet } = fixture(
      stored([task('question', QUESTION_1)]),
    );
    questionGet.mockRejectedValue(exception);
    const result = await service.forOwner('current-student', SUBJECT);
    expect(result.items).toEqual([
      { kind: 'question', id: QUESTION_1, status: 'unavailable' },
    ]);
  });

  it('returns zero checks without querying foreign content when all tasks are done', async () => {
    const { service, resourceGet, questionGet } = fixture(
      stored([task('resource', RESOURCE_1, true)]),
    );
    const result = await service.forOwner('current-student', SUBJECT);
    expect(result).toEqual({
      subjectId: SUBJECT,
      revision: 3,
      checked: 0,
      available: 0,
      unavailable: 0,
      items: [],
    });
    expect(resourceGet).not.toHaveBeenCalled();
    expect(questionGet).not.toHaveBeenCalled();
  });

  it('rejects a missing saved plan without invoking resource or Q&A readers', async () => {
    const { service, resourceGet, questionGet } = fixture(null);
    await expect(
      service.forOwner('current-student', SUBJECT),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(resourceGet).not.toHaveBeenCalled();
    expect(questionGet).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'different owner', patch: { ownerUserId: 'other' } },
    { name: 'other subject', patch: { subjectId: FOREIGN_SUBJECT } },
    { name: 'invalid revision', patch: { revision: 0 } },
    { name: 'unsafe revision', patch: { revision: Number.MAX_SAFE_INTEGER + 1 } },
    { name: 'bad ID', patch: { subjectId: 'invalid' } },
    { name: 'nonexistent plan', patch: { plan: null } },
    {
      name: 'corrupt plan',
      patch: { plan: { version: 7, notes: 'private' } },
    },
  ])('fails closed for $name in stored progress', async ({ patch }) => {
    const { service, resourceGet, questionGet } = fixture({
      ...stored(),
      ...patch,
    });
    await expect(
      service.forOwner('current-student', SUBJECT),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(resourceGet).not.toHaveBeenCalled();
    expect(questionGet).not.toHaveBeenCalled();
  });

  it('propagates infrastructure failures rather than claiming access denied', async () => {
    const { service, questionGet } = fixture(
      stored([task('question', QUESTION_1)]),
    );
    questionGet.mockRejectedValue(
      new InternalServerErrorException('Mongo unavailable'),
    );
    await expect(service.forOwner('current-student', SUBJECT)).rejects.toThrow(
      'Mongo unavailable',
    );
  });

  it('propagates plan-store failures instead of reporting every link unavailable', async () => {
    const { service, exec, resourceGet } = fixture(stored());
    exec.mockRejectedValue(new Error('Mongo read failed'));
    await expect(service.forOwner('current-student', SUBJECT)).rejects.toThrow(
      'Mongo read failed',
    );
    expect(resourceGet).not.toHaveBeenCalled();
  });

  it('checks no more than four links concurrently and no more than 24 total', async () => {
    const ids = Array.from(
      { length: STUDY_TASK_REFERENCE_CONCURRENCY + 1 },
      (_, index) =>
        '269f2da7-f70c-418d-9151-' + String(index + 10).padStart(12, '0'),
    );
    const { service, resourceGet } = fixture(
      stored(ids.map((id) => task('resource', id))),
    );
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    resourceGet.mockImplementation(async () => {
      await gate;
      return { resource: {} };
    });
    const pending = service.forOwner('current-student', SUBJECT);
    for (let i = 0; i < 12; i++) await Promise.resolve();
    expect(resourceGet).toHaveBeenCalledTimes(STUDY_TASK_REFERENCE_CONCURRENCY);
    release();
    const result = await pending;
    expect(resourceGet).toHaveBeenCalledTimes(ids.length);
    expect(result.items.map((item) => item.id)).toEqual(ids);
    expect(result.checked).toBe(ids.length);
    expect(result.available).toBe(ids.length);
    expect(STUDY_TASK_REFERENCE_MAX_CHECKS).toBe(24);
  });
});
