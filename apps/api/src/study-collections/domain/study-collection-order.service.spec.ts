import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { StudyCollectionRecord, StudyCollectionStore } from './study-collection.store';
import { StudyCollectionOrderService } from './study-collection-order.service';

const collectionId = '11111111-1111-4111-8111-111111111111';
const a = '22222222-2222-4222-8222-222222222222';
const b = '33333333-3333-4333-8333-333333333333';
const c = '44444444-4444-4444-8444-444444444444';
const now = new Date('2026-10-20T12:00:00.000Z');
const later = new Date('2026-10-20T12:01:00.000Z');

function row(overrides: Partial<StudyCollectionRecord> = {}): StudyCollectionRecord {
  return {
    id: collectionId,
    ownerUserId: 'owner-a',
    operationKey: '55555555-5555-4555-8555-555555555555',
    title: 'Exámenes',
    description: null,
    resourceIds: [a, b, c],
    revision: 4,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function fixture(current: StudyCollectionRecord | null = row(), updated: StudyCollectionRecord | null = row({
  resourceIds: [c, a, b],
  revision: 5,
  updatedAt: later,
})) {
  const findOwned = jest.fn().mockResolvedValue(current);
  const reorderResources = jest.fn().mockResolvedValue(updated);
  const service = new StudyCollectionOrderService({
    findOwned,
    reorderResources,
  } as unknown as StudyCollectionStore);
  return { service, findOwned, reorderResources };
}

describe('B153 owner-scoped resource order service', () => {
  it('reorders only a full permutation with an atomic prior-array and revision condition', async () => {
    const f = fixture();
    await expect(f.service.reorder('owner-a', collectionId, {
      expectedRevision: 4,
      resourceIds: [c, a, b],
    })).resolves.toEqual({
      changed: true,
      collection: {
        id: collectionId,
        revision: 5,
        resourceCount: 3,
        resourceIds: [c, a, b],
        updatedAt: later.toISOString(),
      },
    });
    expect(f.findOwned).toHaveBeenCalledWith(collectionId, 'owner-a');
    expect(f.reorderResources).toHaveBeenCalledWith({
      id: collectionId,
      ownerUserId: 'owner-a',
      expectedRevision: 4,
      originalResourceIds: [a, b, c],
      orderedResourceIds: [c, a, b],
    });
  });

  it('is an unchanged no-op without a write or revision bump', async () => {
    const f = fixture();
    await expect(f.service.reorder('owner-a', collectionId, {
      expectedRevision: 4,
      resourceIds: [a, b, c],
    })).resolves.toEqual({
      changed: false,
      collection: {
        id: collectionId,
        revision: 4,
        resourceCount: 3,
        resourceIds: [a, b, c],
        updatedAt: now.toISOString(),
      },
    });
    expect(f.reorderResources).not.toHaveBeenCalled();
  });

  it('allows a no-op for an empty owned collection, without manufacturing references', async () => {
    const f = fixture(row({ resourceIds: [], revision: 2 }));
    await expect(f.service.reorder('owner-a', collectionId, {
      expectedRevision: 2,
      resourceIds: [],
    })).resolves.toMatchObject({
      changed: false,
      collection: { resourceIds: [], resourceCount: 0, revision: 2 },
    });
    expect(f.reorderResources).not.toHaveBeenCalled();
  });

  it('rejects invalid input before consulting the repository', async () => {
    const invalid: Array<{ expectedRevision: number; resourceIds: string[] }> = [
      { expectedRevision: 0, resourceIds: [a, b, c] },
      { expectedRevision: 1.5, resourceIds: [a, b, c] },
      { expectedRevision: Number.NaN, resourceIds: [a, b, c] },
      { expectedRevision: 4, resourceIds: [a, a, b] },
      { expectedRevision: 4, resourceIds: [a, 'not-uuid'] },
      { expectedRevision: 4, resourceIds: Array(101).fill(a) as string[] },
    ];
    const f = fixture();
    for (const input of invalid) {
      await expect(f.service.reorder('owner-a', collectionId, input))
        .rejects.toBeInstanceOf(UnprocessableEntityException);
    }
    await expect(f.service.reorder('', collectionId, {
      expectedRevision: 4, resourceIds: [a, b, c],
    })).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(f.service.reorder('owner-a', 'bad-id', {
      expectedRevision: 4, resourceIds: [a, b, c],
    })).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(f.findOwned).not.toHaveBeenCalled();
  });

  it('hides foreign or deleted collection behind the owner-scoped 404', async () => {
    const f = fixture(null);
    await expect(f.service.reorder('owner-a', collectionId, {
      expectedRevision: 4,
      resourceIds: [a, b, c],
    })).rejects.toBeInstanceOf(NotFoundException);
    expect(f.reorderResources).not.toHaveBeenCalled();
  });

  it('refuses a stale revision even when proposed order is unchanged', async () => {
    const f = fixture();
    await expect(f.service.reorder('owner-a', collectionId, {
      expectedRevision: 3,
      resourceIds: [a, b, c],
    })).rejects.toBeInstanceOf(ConflictException);
    expect(f.reorderResources).not.toHaveBeenCalled();
  });

  it('refuses additions, omissions or substitutions rather than modifying collection membership', async () => {
    const f = fixture();
    for (const ids of [
      [a, b],
      [a, b, c, '66666666-6666-4666-8666-666666666666'],
      [a, b, '66666666-6666-4666-8666-666666666666'],
    ]) {
      await expect(f.service.reorder('owner-a', collectionId, {
        expectedRevision: 4,
        resourceIds: ids,
      })).rejects.toBeInstanceOf(ConflictException);
    }
    expect(f.reorderResources).not.toHaveBeenCalled();
  });

  it('fails closed on malformed owned collection records', async () => {
    for (const bad of [
      { ownerUserId: 'other' },
      { id: 'not-uuid' },
      { revision: 0 },
      { resourceIds: [a, a, b] },
      { resourceIds: [a, 'bad-uuid'] },
      { resourceIds: 'wrong-type' },
      { updatedAt: new Date(Number.NaN) },
    ]) {
      const f = fixture(row(bad as Partial<StudyCollectionRecord>));
      await expect(f.service.reorder('owner-a', collectionId, {
        expectedRevision: 4,
        resourceIds: [a, b, c],
      })).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(f.reorderResources).not.toHaveBeenCalled();
    }
  });

  it('reports the CAS conflict if another writer changes the collection before commit', async () => {
    const f = fixture(row(), null);
    await expect(f.service.reorder('owner-a', collectionId, {
      expectedRevision: 4,
      resourceIds: [c, a, b],
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects inconsistent mutation results instead of declaring success', async () => {
    for (const bad of [
      { revision: 4 },
      { revision: 6 },
      { ownerUserId: 'other' },
      { resourceIds: [a, b, c] },
      { resourceIds: [c, a] },
      { updatedAt: new Date(Number.NaN) },
    ]) {
      const f = fixture(row(), row({
        resourceIds: [c, a, b], revision: 5, updatedAt: later, ...bad,
      }));
      await expect(f.service.reorder('owner-a', collectionId, {
        expectedRevision: 4,
        resourceIds: [c, a, b],
      })).rejects.toBeInstanceOf(ServiceUnavailableException);
    }
  });

  it('does not turn repository outages into a synthetic 404 or conflict', async () => {
    const f = fixture();
    f.reorderResources.mockRejectedValue(new Error('mongo-offline'));
    await expect(f.service.reorder('owner-a', collectionId, {
      expectedRevision: 4,
      resourceIds: [c, a, b],
    })).rejects.toThrow('mongo-offline');
  });
});
