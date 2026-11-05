import { ServiceUnavailableException } from '@nestjs/common';
import { StudyProgressService } from './study-progress.service';

const SUBJECT_ONE = '11111111-1111-4111-8111-111111111111';
const SUBJECT_TWO = '22222222-2222-4222-8222-222222222222';

function makeSubjectRow(subjectId = SUBJECT_ONE) {
  return {
    subjectId,
    revision: 2,
    updatedAt: new Date('2026-10-19T18:00:00.000Z'),
    // The persisted plan may contain private notes; listing never sends them.
    plan: { title: 'Private study session', notes: 'Sensitive personal notes' },
    ownerUserId: 'do-not-expose-owner',
  };
}

function setup(rows: unknown[]) {
  const query = {
    select: jest.fn(),
    sort: jest.fn(),
    limit: jest.fn(),
    lean: jest.fn(),
    exec: jest.fn().mockResolvedValue(rows),
  };
  query.select.mockReturnValue(query);
  query.sort.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.lean.mockReturnValue(query);
  const progress = { find: jest.fn().mockReturnValue(query) };
  const service = new StudyProgressService(
    progress as never,
    {} as never,
    {} as never,
  );
  return { service, progress, query };
}

describe('B143 — private study-progress index (API only)', () => {
  it('returns only bounded metadata for the authenticated owner', async () => {
    const { service, progress, query } = setup([
      makeSubjectRow(SUBJECT_ONE),
      makeSubjectRow(SUBJECT_TWO),
    ]);
    await expect(service.list('owner-a')).resolves.toEqual({
      items: [
        {
          subjectId: SUBJECT_ONE,
          revision: 2,
          updatedAt: '2026-10-19T18:00:00.000Z',
        },
        {
          subjectId: SUBJECT_TWO,
          revision: 2,
          updatedAt: '2026-10-19T18:00:00.000Z',
        },
      ],
    });
    expect(progress.find).toHaveBeenCalledWith({ ownerUserId: 'owner-a' });
    expect(query.select).toHaveBeenCalledWith({
      _id: 0,
      subjectId: 1,
      revision: 1,
      updatedAt: 1,
    });
    expect(query.sort).toHaveBeenCalledWith({ subjectId: 1 });
    expect(query.limit).toHaveBeenCalledWith(17);
  });

  it('returns an empty index without exposing another account', async () => {
    const { service, progress } = setup([]);
    await expect(service.list('owner-b')).resolves.toEqual({ items: [] });
    expect(progress.find).toHaveBeenCalledWith({ ownerUserId: 'owner-b' });
  });

  it('refuses to query for a missing owner', async () => {
    const { service, progress } = setup([]);
    await expect(service.list('')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(progress.find).not.toHaveBeenCalled();
  });

  it('fails closed on legacy malformed rows rather than leaking them', async () => {
    for (const invalid of [
      { subjectId: 'not-a-uuid' },
      { revision: 0 },
      { revision: 1.5 },
      { updatedAt: new Date('bad date') },
      { updatedAt: '2026-10-19T18:00:00.000Z' },
    ]) {
      const { service } = setup([{ ...makeSubjectRow(), ...invalid }]);
      await expect(service.list('owner-a')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    }
  });

  it('rejects a corrupted over-quota index rather than truncating silently', async () => {
    const rows = Array.from({ length: 17 }, () => makeSubjectRow());
    const { service } = setup(rows);
    await expect(service.list('owner-a')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
