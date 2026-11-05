import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type {
  StudyCollectionRecord,
  StudyCollectionStore,
} from './study-collection.store';
import { StudyCollectionOrderService } from './study-collection-order.service';

const collectionId = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
const a = 'aaaa1111-aaaa-4111-8111-aaaaaaaaaaaa';
const b = 'bbbb2222-bbbb-4222-8222-bbbbbbbbbbbb';
const c = 'cccc3333-cccc-4333-8333-cccccccccccc';
const now = new Date('2026-10-20T12:00:00.000Z');
const later = new Date('2026-10-20T12:01:00.000Z');
type RowPatch = Partial<StudyCollectionRecord>;

function row(overrides: RowPatch = {}): StudyCollectionRecord {
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

function fixture(
  current: RowPatch | null = {},
  updated: RowPatch | null = {
    resourceIds: [c, a, b],
    revision: 5,
    updatedAt: later,
  },
) {
  const findOwned = jest
    .fn()
    .mockResolvedValue(current === null ? null : row(current));
  const reorderResources = jest
    .fn()
    .mockResolvedValue(updated === null ? null : row(updated));
  const service = new StudyCollectionOrderService({
    findOwned,
    reorderResources,
  } as unknown as StudyCollectionStore);
  return { service, findOwned, reorderResources };
}

function attempt(
  service: StudyCollectionOrderService,
  resourceIds: string[],
  expectedRevision = 4,
) {
  return service.reorder('owner-a', collectionId, {
    expectedRevision,
    resourceIds,
  });
}

describe('B153 owner-scoped resource order service', () => {
  it('atomically reorders a full existing permutation', async () => {
    const f = fixture();
    const result = await attempt(f.service, [c, a, b]);
    expect(result).toEqual({
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

  it('normalizes UUID casing before owner lookup and the membership CAS', async () => {
    const f = fixture();
    await expect(
      f.service.reorder('owner-a', collectionId.toUpperCase(), {
        expectedRevision: 4,
        resourceIds: [c.toUpperCase(), a.toUpperCase(), b.toUpperCase()],
      }),
    ).resolves.toMatchObject({ changed: true });
    expect(f.findOwned).toHaveBeenCalledWith(collectionId, 'owner-a');
    expect(f.reorderResources).toHaveBeenCalledWith({
      id: collectionId,
      ownerUserId: 'owner-a',
      expectedRevision: 4,
      originalResourceIds: [a, b, c],
      orderedResourceIds: [c, a, b],
    });
  });

  it('keeps the revision and timestamp unchanged for an identical order', async () => {
    const f = fixture();
    const result = await attempt(f.service, [a, b, c]);
    expect(result).toEqual({
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

  it('accepts an empty array only for an already empty collection', async () => {
    const f = fixture({ resourceIds: [], revision: 2 });
    const result = await attempt(f.service, [], 2);
    expect(result).toMatchObject({
      changed: false,
      collection: { resourceIds: [], resourceCount: 0, revision: 2 },
    });
    expect(f.reorderResources).not.toHaveBeenCalled();
  });

  it('rejects duplicate, malformed and oversized inputs before storage', async () => {
    const f = fixture();
    for (const ids of [
      [a, a, b],
      [a.toUpperCase(), a, b],
      [a, 'not-uuid'],
      Array(101).fill(a) as string[],
    ]) {
      await expect(attempt(f.service, ids)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    }
    for (const revision of [0, -1, 1.5, Number.NaN]) {
      await expect(
        attempt(f.service, [a, b, c], revision),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    }
    await expect(
      f.service.reorder('', collectionId, {
        expectedRevision: 4,
        resourceIds: [a, b, c],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      f.service.reorder('owner-a', 'bad-id', {
        expectedRevision: 4,
        resourceIds: [a, b, c],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(f.findOwned).not.toHaveBeenCalled();
  });

  it('returns owner-scoped 404 for another account or deleted collection', async () => {
    const f = fixture(null);
    await expect(attempt(f.service, [c, a, b])).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(f.reorderResources).not.toHaveBeenCalled();
  });

  it('rejects stale revisions, including replay of the same order', async () => {
    const f = fixture();
    await expect(attempt(f.service, [a, b, c], 3)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(f.reorderResources).not.toHaveBeenCalled();
  });

  it('prevents additions, removals and substitutions through reordering', async () => {
    const f = fixture();
    for (const ids of [
      [a, b],
      [a, b, c, '66666666-6666-4666-8666-666666666666'],
      [a, b, '66666666-6666-4666-8666-666666666666'],
    ]) {
      await expect(attempt(f.service, ids)).rejects.toBeInstanceOf(
        ConflictException,
      );
    }
    expect(f.reorderResources).not.toHaveBeenCalled();
  });

  it('fails closed on invalid owned documents', async () => {
    for (const bad of [
      { ownerUserId: 'other' },
      { id: 'not-uuid' },
      { revision: 0 },
      { resourceIds: [a, a, b] },
      { resourceIds: [a.toUpperCase(), a, b] },
      { resourceIds: [a, 'bad-uuid'] },
      { resourceIds: 'wrong-type' },
      { updatedAt: new Date(Number.NaN) },
    ]) {
      const f = fixture(bad as RowPatch);
      await expect(attempt(f.service, [a, b, c])).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(f.reorderResources).not.toHaveBeenCalled();
    }
  });

  it('reports an atomic compare-and-swap conflict without retrying', async () => {
    const f = fixture({}, null);
    await expect(attempt(f.service, [c, a, b])).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(f.reorderResources).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed mutation results instead of claiming success', async () => {
    for (const bad of [
      { revision: 4 },
      { revision: 6 },
      { ownerUserId: 'other' },
      { resourceIds: [a, b, c] },
      { resourceIds: [c, a] },
      { updatedAt: new Date(Number.NaN) },
    ]) {
      const f = fixture(
        {},
        {
          resourceIds: [c, a, b],
          revision: 5,
          updatedAt: later,
          ...bad,
        },
      );
      await expect(attempt(f.service, [c, a, b])).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    }
  });

  it('preserves Mongo failures rather than inventing success or a 404', async () => {
    const f = fixture();
    f.reorderResources.mockRejectedValue(new Error('mongo-offline'));
    await expect(attempt(f.service, [c, a, b])).rejects.toThrow(
      'mongo-offline',
    );
  });
});
