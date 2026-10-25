import type { Connection, Model } from 'mongoose';

import type { User } from '../users/schemas/user.schema';
import { StudyProgress } from './mongo/study-progress.schema';
import { StudyProgressService } from './study-progress.service';

const ownerUserId = 'owner-sentinel';
const subjectId = '11111111-1111-4111-8111-111111111111';
const resourceId = '22222222-2222-4222-8222-222222222222';
const createdAt = new Date('2026-10-01T10:00:00.000Z');
const updatedAt = new Date('2026-10-02T10:00:00.000Z');

const storedPlan = () => ({
  format: 'losapuntes.study-session',
  version: 1,
  subjectId,
  title: ' Repaso del parcial ',
  notes: '',
  startsAt: null,
  tasks: [{ kind: 'resource', id: resourceId, minutes: 25, done: false }],
});

const stored = (changes: Record<string, unknown> = {}) => ({
  ownerUserId,
  subjectId,
  revision: 2,
  createdAt,
  updatedAt,
  plan: storedPlan(),
  _id: 'internal-record',
  internalTrace: 'not-portable',
  ...changes,
});

function fixture(row: unknown = stored()) {
  const exec = jest.fn().mockResolvedValue(row);
  const lean = jest.fn().mockReturnValue({ exec });
  const findOne = jest.fn().mockReturnValue({ lean });
  const service = new StudyProgressService(
    { findOne } as unknown as Model<StudyProgress>,
    {} as Model<User>,
    {} as Connection,
  );
  return { service, findOne, exec };
}

describe('B188 private stored Study Progress response', () => {
  it('returns only validated owner-authored plan and revision, not Mongo internals', async () => {
    const f = fixture();
    await expect(f.service.get(ownerUserId, subjectId)).resolves.toEqual({
      progress: {
        plan: {
          format: 'losapuntes.study-session',
          version: 1,
          subjectId,
          title: 'Repaso del parcial',
          notes: '',
          startsAt: null,
          tasks: [
            { kind: 'resource', id: resourceId, minutes: 25, done: false },
          ],
        },
        revision: 2,
        updatedAt,
      },
    });
    expect(f.findOne).toHaveBeenCalledWith({ ownerUserId, subjectId });
  });

  it('does not return a stored plan containing an unknown token or extra fields', async () => {
    const f = fixture(
      stored({
        plan: { ...storedPlan(), signedUrl: 'SECRET-SIGNED-URL' },
      }),
    );
    await expect(f.service.get(ownerUserId, subjectId)).rejects.toMatchObject({
      status: 500,
      response: {
        code: 'STUDY_PROGRESS_STORED_INVALID',
        message: 'Saved study progress is unavailable',
      },
    });
  });

  it('rejects nested private links in persisted tasks', async () => {
    const f = fixture(
      stored({
        plan: {
          ...storedPlan(),
          tasks: [
            {
              ...storedPlan().tasks[0],
              accessUrl: 'https://private.example/SECRET',
            },
          ],
        },
      }),
    );
    await expect(f.service.get(ownerUserId, subjectId)).rejects.toMatchObject({
      response: { code: 'STUDY_PROGRESS_STORED_INVALID' },
    });
  });

  it('never projects a stored record belonging to a different owner', async () => {
    const f = fixture(stored({ ownerUserId: 'foreign-account' }));
    await expect(f.service.get(ownerUserId, subjectId)).rejects.toMatchObject({
      status: 500,
      response: { code: 'STUDY_PROGRESS_STORED_INVALID' },
    });
    expect(f.findOne).toHaveBeenCalledWith({ ownerUserId, subjectId });
  });

  it('fails closed on a cross-subject record even if an adapter returns one', async () => {
    const f = fixture(
      stored({ subjectId: '33333333-3333-4333-8333-333333333333' }),
    );
    await expect(f.service.get(ownerUserId, subjectId)).rejects.toMatchObject({
      response: { code: 'STUDY_PROGRESS_STORED_INVALID' },
    });
    expect(f.findOne).toHaveBeenCalledWith({ ownerUserId, subjectId });
  });

  it('rejects mismatched subject inside the saved plan', async () => {
    const f = fixture(
      stored({
        plan: {
          ...storedPlan(),
          subjectId: '33333333-3333-4333-8333-333333333333',
        },
      }),
    );
    await expect(f.service.get(ownerUserId, subjectId)).rejects.toMatchObject({
      response: { code: 'STUDY_PROGRESS_STORED_INVALID' },
    });
  });

  it('rejects corrupted stored revision metadata', async () => {
    for (const revision of [0, -1, 1.5, Number.NaN, 2_147_483_648]) {
      const f = fixture(stored({ revision }));
      await expect(f.service.get(ownerUserId, subjectId)).rejects.toMatchObject(
        { response: { code: 'STUDY_PROGRESS_STORED_INVALID' } },
      );
    }
  });

  it('rejects missing, impossible, or reversed stored timestamps', async () => {
    for (const values of [
      { createdAt: 'not a Date' },
      { updatedAt: new Date(Number.NaN) },
      { createdAt: new Date('2026-10-03T10:00:00.000Z') },
      { updatedAt: null },
    ]) {
      const f = fixture(stored(values));
      await expect(f.service.get(ownerUserId, subjectId)).rejects.toMatchObject(
        { response: { code: 'STUDY_PROGRESS_STORED_INVALID' } },
      );
    }
  });

  it('keeps the existing private 404 behavior for absent progress', async () => {
    const f = fixture(null);
    await expect(f.service.get(ownerUserId, subjectId)).rejects.toMatchObject({
      status: 404,
      response: { code: 'STUDY_PROGRESS_NOT_FOUND' },
    });
  });

  it('propagates database outages instead of pretending progress is absent', async () => {
    const f = fixture();
    const outage = new Error('database unavailable');
    f.exec.mockRejectedValueOnce(outage);
    await expect(f.service.get(ownerUserId, subjectId)).rejects.toBe(outage);
  });
});
