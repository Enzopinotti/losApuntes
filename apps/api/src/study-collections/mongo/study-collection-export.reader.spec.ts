import { UnprocessableEntityException } from '@nestjs/common';
import type { Model } from 'mongoose';

import { StudyCollection } from './study-collection.mongo-schema';
import { StudyCollectionExportReader } from './study-collection-export.reader';

const owner = 'owner-alice';
const second = 'owner-bob';
const id1 = '11111111-1111-4111-8111-111111111111';
const id2 = '22222222-2222-4222-8222-222222222222';
const id3 = '33333333-3333-4333-8333-333333333333';
const resource = '44444444-4444-4444-8444-444444444444';

function document(id: string) {
  return {
    id,
    title: 'Primer parcial',
    description: 'Mis ejercicios',
    resourceIds: [resource],
    revision: 2,
    createdAt: new Date('2026-10-01T12:00:00.000Z'),
    updatedAt: new Date('2026-10-02T12:00:00.000Z'),
    // Intentionally not selected, never returned:
    ownerUserId: owner,
    operationKey: 'secret-idempotency-key',
    _id: 'private-db-id',
    accessToken: 'NEVER_EXPORT',
  };
}

function fixture(rows: ReturnType<typeof document>[]) {
  const query = {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(rows),
  };
  const existsQuery = {
    exec: jest.fn().mockResolvedValue(null),
  };
  const model = {
    find: jest.fn().mockReturnValue(query),
    exists: jest.fn().mockReturnValue(existsQuery),
  };
  return {
    query,
    model,
    existsQuery,
    reader: new StudyCollectionExportReader(
      model as unknown as Model<StudyCollection>,
    ),
  };
}

describe('StudyCollectionExportReader: B46 owner-only projection', () => {
  it('filters by exact owner and uses an immutable id ASC page with allowlisted Mongo fields', async () => {
    const f = fixture([document(id1), document(id2), document(id3)]);
    const first = await f.reader.listAccountExportCollections(owner, {
      limit: 2,
      cursor: null,
    });
    expect(f.model.find).toHaveBeenCalledWith({ ownerUserId: owner });
    expect(f.query.sort).toHaveBeenCalledWith({ id: 1 });
    expect(f.query.limit).toHaveBeenCalledWith(3);
    expect(f.query.select).toHaveBeenCalledWith({
      _id: 0,
      id: 1,
      title: 1,
      description: 1,
      resourceIds: 1,
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    expect(first.items).toEqual([
      {
        id: id1,
        title: 'Primer parcial',
        description: 'Mis ejercicios',
        resourceIds: [resource],
        revision: 2,
        createdAt: '2026-10-01T12:00:00.000Z',
        updatedAt: '2026-10-02T12:00:00.000Z',
      },
      {
        id: id2,
        title: 'Primer parcial',
        description: 'Mis ejercicios',
        resourceIds: [resource],
        revision: 2,
        createdAt: '2026-10-01T12:00:00.000Z',
        updatedAt: '2026-10-02T12:00:00.000Z',
      },
    ]);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(JSON.stringify(first)).not.toMatch(
      /secret-idempotency-key|NEVER_EXPORT|private-db-id|owner-alice/u,
    );
  });

  it('binds cursor to its original owner and never queries Mongo for a different owner', async () => {
    const f = fixture([document(id1), document(id2)]);
    const initial = await f.reader.listAccountExportCollections(owner, {
      limit: 1,
      cursor: null,
    });
    expect(initial.nextCursor).not.toBeNull();
    f.model.find.mockClear();
    await expect(
      f.reader.listAccountExportCollections(second, {
        limit: 1,
        cursor: initial.nextCursor,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(f.model.find).not.toHaveBeenCalled();
    await f.reader.listAccountExportCollections(owner, {
      limit: 1,
      cursor: initial.nextCursor,
    });
    expect(f.model.find).toHaveBeenCalledWith({
      ownerUserId: owner,
      id: { $gt: id1 },
    });
  });

  it('rejects tampered cursors, malformed owner and unsafe page budgets before querying', async () => {
    const f = fixture([]);
    await expect(
      f.reader.listAccountExportCollections(owner, {
        limit: 101,
        cursor: null,
      }),
    ).rejects.toThrow('page budget');
    await expect(
      f.reader.listAccountExportCollections(owner, {
        limit: 0,
        cursor: null,
      }),
    ).rejects.toThrow('page budget');
    await expect(
      f.reader.listAccountExportCollections('', {
        limit: 10,
        cursor: null,
      }),
    ).rejects.toThrow('owner');
    await expect(
      f.reader.listAccountExportCollections(owner, {
        limit: 10,
        cursor: '%%%',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    const tampered = Buffer.from(
      JSON.stringify({
        version: 1,
        ownerUserId: owner,
        afterId: id2,
        admin: true,
      }),
    ).toString('base64url');
    await expect(
      f.reader.listAccountExportCollections(owner, {
        limit: 10,
        cursor: tampered,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(f.model.find).not.toHaveBeenCalled();
  });

  it('accepts empty and last pages, never returning an invented next cursor', async () => {
    const empty = fixture([]);
    await expect(
      empty.reader.listAccountExportCollections(owner, {
        limit: 100,
        cursor: null,
      }),
    ).resolves.toEqual({ items: [], nextCursor: null });
    const final = fixture([document(id1)]);
    const page = await final.reader.listAccountExportCollections(owner, {
      limit: 1,
      cursor: null,
    });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });

  it('fails closed if a malformed row would make the export dishonest', async () => {
    const bad = fixture([
      { ...document(id1), resourceIds: ['revoked:not-uuid'] },
    ]);
    await expect(
      bad.reader.listAccountExportCollections(owner, {
        limit: 5,
        cursor: null,
      }),
    ).rejects.toThrow('row is invalid');
    const tooMany = fixture([
      {
        ...document(id1),
        resourceIds: Array.from(
          { length: 101 },
          (_, i) =>
            `000000${String(i).padStart(2, '0')}-0000-4000-8000-000000000000`,
        ),
      },
    ]);
    await expect(
      tooMany.reader.listAccountExportCollections(owner, {
        limit: 5,
        cursor: null,
      }),
    ).rejects.toThrow('row is invalid');
    const duplicate = fixture([
      {
        ...document(id1),
        resourceIds: [resource, resource],
      },
    ]);
    await expect(
      duplicate.reader.listAccountExportCollections(owner, {
        limit: 5,
        cursor: null,
      }),
    ).rejects.toThrow('row is invalid');
    const invalidDate = fixture([
      { ...document(id1), createdAt: new Date('not-a-date') },
    ]);
    await expect(
      invalidDate.reader.listAccountExportCollections(owner, {
        limit: 5,
        cursor: null,
      }),
    ).rejects.toThrow('row is invalid');
  });
  it('checks only the active owner for pre-existing collections after rollback', async () => {
    const f = fixture([]);
    f.existsQuery.exec
      .mockResolvedValueOnce({ _id: 'private-document' })
      .mockResolvedValueOnce(null);
    await expect(f.reader.hasOwnedCollections(owner)).resolves.toBe(true);
    await expect(f.reader.hasOwnedCollections(second)).resolves.toBe(false);
    expect(f.model.exists.mock.calls).toEqual([
      [{ ownerUserId: owner }],
      [{ ownerUserId: second }],
    ]);
    expect(f.model.find).not.toHaveBeenCalled();
    expect(f.query.exec).not.toHaveBeenCalled();
  });

  it('fails closed for unknown owner or Mongo errors during rollback detection', async () => {
    const f = fixture([]);
    await expect(f.reader.hasOwnedCollections(' ')).rejects.toThrow(
      'owner is required',
    );
    expect(f.model.exists).not.toHaveBeenCalled();
    const failed = new Error('Mongo unavailable');
    f.existsQuery.exec.mockRejectedValueOnce(failed);
    await expect(f.reader.hasOwnedCollections(owner)).rejects.toBe(failed);
    expect(f.model.find).not.toHaveBeenCalled();
  });
});
