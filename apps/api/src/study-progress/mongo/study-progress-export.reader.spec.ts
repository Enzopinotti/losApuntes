import { UnprocessableEntityException } from '@nestjs/common';
import type { Model } from 'mongoose';
import { StudyProgressExportReader } from './study-progress-export.reader';
import { StudyProgress } from './study-progress.schema';

const owner = 'owner-a';
const other = 'owner-b';
const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const c = '33333333-3333-4333-8333-333333333333';
function stored(subjectId: string) {
  return {
    subjectId,
    revision: 2,
    plan: {
      format: 'losapuntes.study-session',
      version: 1,
      subjectId,
      title: 'Parcial',
      notes: '',
      startsAt: null,
      tasks: [],
    },
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    updatedAt: new Date('2026-10-02T10:00:00.000Z'),
    ownerUserId: owner,
    excludedField: 'not-exported',
    _id: 'internal',
  };
}
function fixture(rows: ReturnType<typeof stored>[] = []) {
  const query = {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(rows),
  };
  const exists = { exec: jest.fn().mockResolvedValue(null) };
  const model = {
    find: jest.fn().mockReturnValue(query),
    exists: jest.fn().mockReturnValue(exists),
  };
  return {
    query,
    exists,
    model,
    reader: new StudyProgressExportReader(
      model as unknown as Model<StudyProgress>,
    ),
  };
}

describe('B62 Study Progress owner export reader', () => {
  it('uses owner and subject-only projection with a bounded immutable cursor', async () => {
    const f = fixture([stored(a), stored(b), stored(c)]);
    const page = await f.reader.listAccountExportProgress(owner, {
      cursor: null,
      limit: 2,
    });
    expect(f.model.find).toHaveBeenCalledWith({ ownerUserId: owner });
    expect(f.query.sort).toHaveBeenCalledWith({ subjectId: 1 });
    expect(f.query.limit).toHaveBeenCalledWith(3);
    expect(f.query.select).toHaveBeenCalledWith({
      _id: 0,
      subjectId: 1,
      plan: 1,
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(page.items[0]).toEqual({
      subjectId: a,
      plan: stored(a).plan,
      revision: 2,
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-02T10:00:00.000Z',
    });
    expect(JSON.stringify(page)).not.toContain('not-exported');
    f.model.find.mockClear();
    await expect(
      f.reader.listAccountExportProgress(other, {
        cursor: page.nextCursor,
        limit: 2,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(f.model.find).not.toHaveBeenCalled();
    await f.reader.listAccountExportProgress(owner, {
      cursor: page.nextCursor,
      limit: 2,
    });
    expect(f.model.find).toHaveBeenCalledWith({
      ownerUserId: owner,
      subjectId: { $gt: b },
    });
  });
  it('rejects malformed cursors and budgets before querying', async () => {
    const f = fixture();
    const injection = Buffer.from(
      JSON.stringify({
        version: 1,
        ownerUserId: owner,
        afterSubjectId: a,
        extra: true,
      }),
    ).toString('base64url');
    for (const cursor of ['', 'invalid@', injection]) {
      await expect(
        f.reader.listAccountExportProgress(owner, {
          cursor,
          limit: 1,
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    }
    for (const limit of [0, 101, -1]) {
      await expect(
        f.reader.listAccountExportProgress(owner, {
          cursor: null,
          limit,
        }),
      ).rejects.toThrow('budget');
    }
    expect(f.model.find).not.toHaveBeenCalled();
  });
  it('continues to detect records after rollback and propagates outages', async () => {
    const f = fixture();
    await expect(f.reader.hasOwnedProgress(owner)).resolves.toBe(false);
    f.exists.exec.mockResolvedValueOnce({ _id: 'present' });
    await expect(f.reader.hasOwnedProgress(owner)).resolves.toBe(true);
    const problem = new Error('database unavailable');
    f.exists.exec.mockRejectedValueOnce(problem);
    await expect(f.reader.hasOwnedProgress(owner)).rejects.toBe(problem);
  });
  it('rejects malformed persisted plans and corrupted revision metadata', async () => {
    // Model a malformed persisted record without an excess-property error
    // in the strictly typed fixture; the reader must still reject its bytes.
    const malformedPlan = { ...stored(a).plan, unknownField: true };
    const wrong = fixture([
      {
        ...stored(a),
        plan: malformedPlan,
      },
    ]);
    await expect(
      wrong.reader.listAccountExportProgress(owner, {
        cursor: null,
        limit: 2,
      }),
    ).rejects.toThrow();
    const old = fixture([{ ...stored(a), revision: 0 }]);
    await expect(
      old.reader.listAccountExportProgress(owner, {
        cursor: null,
        limit: 2,
      }),
    ).rejects.toThrow('row is invalid');
  });
});
