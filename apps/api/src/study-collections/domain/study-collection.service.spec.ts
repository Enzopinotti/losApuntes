import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { ResourceService } from '../../resources/domain/resource.service';
import type {
  StudyCollectionRecord,
  StudyCollectionStore,
} from './study-collection.store';
import { StudyCollectionService } from './study-collection.service';

const ownerId = 'owner-1';
const collectionId = '11111111-1111-4111-8111-111111111111';
const otherCollection = '22222222-2222-4222-8222-222222222222';
const resourceId = '33333333-3333-4333-8333-333333333333';
const nextId = '44444444-4444-4444-8444-444444444444';
const key = '55555555-5555-4555-8555-555555555555';

function collection(
  overrides: Partial<StudyCollectionRecord> = {},
): StudyCollectionRecord {
  return {
    id: collectionId,
    ownerUserId: ownerId,
    operationKey: key,
    title: 'Primer parcial',
    description: null,
    resourceIds: [resourceId, nextId],
    revision: 2,
    createdAt: new Date('2026-10-14T17:00:00.000Z'),
    updatedAt: new Date('2026-10-14T17:00:00.000Z'),
    ...overrides,
  };
}

function setup(row: StudyCollectionRecord | null = collection()) {
  const store = {
    create: jest.fn().mockResolvedValue(row),
    list: jest
      .fn()
      .mockResolvedValue({ items: row ? [row] : [], hasMore: false }),
    findOwned: jest
      .fn()
      .mockImplementation((id: string, actor: string) =>
        Promise.resolve(row?.id === id && row.ownerUserId === actor ? row : null),
      ),
    updateOwned: jest.fn().mockResolvedValue(row),
    addResource: jest.fn().mockResolvedValue(row),
    removeResource: jest.fn().mockResolvedValue(row),
    deleteOwned: jest.fn().mockResolvedValue(Boolean(row)),
  };
  const get = jest.fn().mockImplementation((id: string) =>
    Promise.resolve({
      resource: {
        id,
        title: 'Apunte de Álgebra',
        academic: { subject: { id: 'subject-id', name: 'Álgebra' } },
      },
    }),
  );
  const service = new StudyCollectionService(
    store,
    { get } as unknown as ResourceService,
  );
  return { service, store, get };
}

describe('StudyCollectionService', () => {
  it('creates normalized private collections with caller-scoped idempotency', async () => {
    const { service, store } = setup();
    const result = await service.create(ownerId, {
      operationKey: key,
      title: '  Primer   parcial  ',
      description: ' ',
    });
    expect(result.collection.resourceCount).toBe(2);
    expect(store.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: ownerId,
        title: 'Primer parcial',
        description: null,
        operationKey: key,
      }),
    );
  });

  it('rejects ambiguous or reused operation keys', async () => {
    const { service, store } = setup(collection({ title: 'Original' }));
    await expect(
      service.create(ownerId, { title: 'Diferente', operationKey: key }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(store.create).toHaveBeenCalledTimes(1);
  });

  it('never lists or resolves collections from another account', async () => {
    const { service, store, get } = setup();
    await expect(service.get('intruder', collectionId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(get).not.toHaveBeenCalled();
    await service.list('intruder', 10);
    expect(store.list).toHaveBeenCalledWith({
      ownerUserId: 'intruder',
      limit: 10,
    });
  });

  it('rechecks authorization when adding a Resource', async () => {
    const { service, store, get } = setup();
    get.mockRejectedValueOnce(new NotFoundException());
    await expect(
      service.addResource(ownerId, collectionId, resourceId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(store.addResource).not.toHaveBeenCalled();
    await service.addResource(ownerId, collectionId, resourceId);
    expect(store.addResource).toHaveBeenCalledWith(
      collectionId,
      ownerId,
      resourceId,
    );
  });

  it('prevents additions beyond the limit, preserving the original Resource', async () => {
    const full = collection({
      resourceIds: Array.from({ length: 100 }, (_, n) => String(n)),
    });
    const { service, store } = setup(full);
    await expect(
      service.addResource(ownerId, collectionId, resourceId),
    ).rejects.toMatchObject({
      response: { code: 'STUDY_COLLECTION_FULL' },
    });
    expect(store.addResource).toHaveBeenCalledTimes(1);
  });

  it('permits removal of a reference without requiring Resource access', async () => {
    const { service, get, store } = setup();
    await service.removeResource(ownerId, collectionId, resourceId);
    expect(get).not.toHaveBeenCalled();
    expect(store.removeResource).toHaveBeenCalledWith(
      collectionId,
      ownerId,
      resourceId,
    );
  });

  describe('B57 conditional recovery removals', () => {
    it('vetoes deleting a reference if the server can read it', async () => {
      const { service, store, get } = setup();
      await expect(
        service.removeResource(ownerId, collectionId, resourceId, 2),
      ).rejects.toMatchObject({
        response: { code: 'STUDY_COLLECTION_REFERENCE_ACCESSIBLE' },
      });
      expect(get).toHaveBeenCalledWith(resourceId, ownerId);
      expect(store.removeResource).not.toHaveBeenCalled();
    });

    it.each([() => new NotFoundException(), () => new ForbiddenException()])(
      'conditionally removes only a confirmed inaccessible reference',
      async (exception) => {
        const { service, store, get } = setup();
        get.mockRejectedValueOnce(exception());
        store.removeResource.mockResolvedValueOnce(
          collection({
            revision: 3,
            resourceIds: [nextId],
          }),
        );
        const result = await service.removeResource(
          ownerId,
          collectionId,
          resourceId,
          2,
        );
        expect(result.collection.revision).toBe(3);
        expect(result.collection.resourceCount).toBe(1);
        expect(store.removeResource).toHaveBeenCalledWith(
          collectionId,
          ownerId,
          resourceId,
          2,
        );
      },
    );

    it('rejects stale revisions without looking up the referenced Resource', async () => {
      const { service, store, get } = setup();
      await expect(
        service.removeResource(ownerId, collectionId, resourceId, 1),
      ).rejects.toMatchObject({
        response: { code: 'STUDY_COLLECTION_REVISION_CONFLICT' },
      });
      expect(store.removeResource).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
    });

    it('rejects changed reference sets before the secondary permission check', async () => {
      const { service, store, get } = setup(
        collection({
          revision: 2,
          resourceIds: [nextId],
        }),
      );
      await expect(
        service.removeResource(ownerId, collectionId, resourceId, 2),
      ).rejects.toMatchObject({
        response: { code: 'STUDY_COLLECTION_REFERENCE_CHANGED' },
      });
      expect(store.removeResource).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
    });

    it('rejects an intervening Mongo revision change atomically', async () => {
      const { service, store, get } = setup();
      get.mockRejectedValueOnce(new NotFoundException());
      store.removeResource.mockResolvedValueOnce(
        collection({
          revision: 3,
          resourceIds: [resourceId, nextId],
        }),
      );
      await expect(
        service.removeResource(ownerId, collectionId, resourceId, 2),
      ).rejects.toMatchObject({
        response: { code: 'STUDY_COLLECTION_REVISION_CONFLICT' },
      });
      expect(store.removeResource).toHaveBeenCalledWith(
        collectionId,
        ownerId,
        resourceId,
        2,
      );
    });

    it('propagates unexpected Resource failures without removing references', async () => {
      const { service, store, get } = setup();
      const failure = new Error('resource backend unavailable');
      get.mockRejectedValueOnce(failure);
      await expect(
        service.removeResource(ownerId, collectionId, resourceId, 2),
      ).rejects.toBe(failure);
      expect(store.removeResource).not.toHaveBeenCalled();
    });

    it.each([0, -2, 1.25, Number.MAX_SAFE_INTEGER + 1])(
      'rejects an invalid optimistic revision %s',
      async (revision) => {
        const { service, store, get } = setup();
        await expect(
          service.removeResource(ownerId, collectionId, resourceId, revision),
        ).rejects.toMatchObject({
          response: { code: 'STUDY_COLLECTION_REVISION_INVALID' },
        });
        expect(store.removeResource).not.toHaveBeenCalled();
        expect(get).not.toHaveBeenCalled();
      },
    );

    it('rejects a foreign collection before checking referenced Resource details', async () => {
      const { service, store, get } = setup();
      await expect(
        service.removeResource('intruder', collectionId, resourceId, 2),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(store.removeResource).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
    });

    it('preserves backward-compatible unconditional user removal', async () => {
      const { service, store, get } = setup();
      await service.removeResource(ownerId, collectionId, resourceId);
      expect(get).not.toHaveBeenCalled();
      expect(store.removeResource).toHaveBeenCalledWith(
        collectionId,
        ownerId,
        resourceId,
      );
    });
  });

  it('returns private placeholders instead of leaking revoked Resource metadata', async () => {
    const { service, get } = setup();
    get.mockRejectedValueOnce(new NotFoundException());
    const result = await service.listResources(ownerId, collectionId, 1);
    expect(result.items).toEqual([{ resourceId, resource: null }]);
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(get).toHaveBeenCalledWith(resourceId, ownerId);
    const next = await service.listResources(
      ownerId,
      collectionId,
      1,
      result.nextCursor ?? undefined,
    );
    expect(next.items[0]?.resourceId).toBe(nextId);
    expect(next.nextCursor).toBeNull();
  });

  it('rejects stale and cross-owner collection resource cursors', async () => {
    const { service, store } = setup();
    const first = await service.listResources(ownerId, collectionId, 1);
    const cursor = first.nextCursor ?? undefined;
    await expect(
      service.listResources('intruder', collectionId, 1, cursor),
    ).rejects.toBeInstanceOf(NotFoundException);
    store.findOwned.mockResolvedValueOnce(collection({ revision: 3 }));
    await expect(
      service.listResources(ownerId, collectionId, 1, cursor),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.listResources(ownerId, otherCollection, 1, cursor),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.listResources(ownerId, collectionId, 1, 'not-valid!'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('returns a recoverable 409 when removing resources shrinks beyond the old cursor index', async () => {
    const { service, store, get } = setup();
    const first = await service.listResources(ownerId, collectionId, 1);
    expect(first.nextCursor).toEqual(expect.any(String));
    store.findOwned.mockResolvedValueOnce(
      collection({ revision: 3, resourceIds: [resourceId] }),
    );
    await expect(
      service.listResources(
        ownerId,
        collectionId,
        1,
        first.nextCursor ?? undefined,
      ),
    ).rejects.toMatchObject({
      response: { code: 'STUDY_COLLECTION_CURSOR_STALE' },
    });
    // Resource metadata must never be retrieved for a stale page.
    expect(get).toHaveBeenCalledTimes(1);

    store.findOwned.mockResolvedValueOnce(
      collection({ revision: 4, resourceIds: [] }),
    );
    await expect(
      service.listResources(
        ownerId,
        collectionId,
        1,
        first.nextCursor ?? undefined,
      ),
    ).rejects.toMatchObject({
      response: { code: 'STUDY_COLLECTION_CURSOR_STALE' },
    });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed same-revision indexes and explicit empty cursor tokens', async () => {
    const { service, store, get } = setup(
      collection({ revision: 2, resourceIds: [resourceId] }),
    );
    const oldCursor = Buffer.from(
      JSON.stringify({
        version: 1,
        ownerUserId: ownerId,
        collectionId,
        revision: 2,
        index: 1,
      }),
    ).toString('base64url');
    await expect(
      service.listResources(ownerId, collectionId, 1, oldCursor),
    ).rejects.toMatchObject({
      response: { code: 'STUDY_COLLECTION_CURSOR_INVALID' },
    });
    await expect(service.list(ownerId, 1, '')).rejects.toMatchObject({
      response: { code: 'STUDY_COLLECTION_CURSOR_INVALID' },
    });
    await expect(
      service.listResources(ownerId, collectionId, 1, ''),
    ).rejects.toMatchObject({
      response: { code: 'STUDY_COLLECTION_CURSOR_INVALID' },
    });

    const malformed = Buffer.from(
      JSON.stringify({
        version: 1,
        ownerUserId: ownerId,
        collectionId,
        revision: '2',
        index: 0,
      }),
    ).toString('base64url');
    await expect(
      service.listResources(ownerId, collectionId, 1, malformed),
    ).rejects.toMatchObject({
      response: { code: 'STUDY_COLLECTION_CURSOR_INVALID' },
    });
    expect(store.list).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it('detects update revisions and disallows empty patches', async () => {
    const { service, store } = setup();
    await expect(
      service.update(ownerId, collectionId, { expectedRevision: 2 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    store.updateOwned.mockResolvedValueOnce(null);
    await expect(
      service.update(ownerId, collectionId, {
        expectedRevision: 1,
        title: 'Cambió',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('binds paginated list cursors to the owner', async () => {
    const { service, store } = setup();
    store.list.mockResolvedValueOnce({
      items: [collection()],
      hasMore: true,
    });
    const page = await service.list(ownerId, 1);
    expect(page.nextCursor).toEqual(expect.any(String));
    await service.list(ownerId, 1, page.nextCursor ?? undefined);
    expect(store.list).toHaveBeenLastCalledWith({
      ownerUserId: ownerId,
      limit: 1,
      after: { createdAt: collection().createdAt, id: collectionId },
    });
    await expect(
      service.list('intruder', 1, page.nextCursor ?? undefined),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
  it('returns a safe placeholder for a reference whose access was revoked', async () => {
    const { service, get } = setup();
    get.mockRejectedValueOnce(new ForbiddenException());
    const result = await service.listResources(ownerId, collectionId, 1);
    expect(result.items).toEqual([{ resourceId, resource: null }]);
  });

  it('rejects malformed and non-canonical cursors without querying private data', async () => {
    const { service, store } = setup();
    const page = await service.list(ownerId, 1);
    const valid = page.nextCursor;
    expect(valid).toBeNull();

    // A URL-safe but oversized/corrupt cursor must be rejected before Mongo.
    await expect(
      service.list(ownerId, 1, 'a'.repeat(512)),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      service.listResources(ownerId, collectionId, 1, 'a'.repeat(512)),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    const invalidCanonical =
      Buffer.from(
        JSON.stringify({ version: 1, ownerUserId: ownerId, index: 1 }),
      ).toString('base64url') + 'A';
    await expect(
      service.listResources(ownerId, collectionId, 1, invalidCanonical),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(store.list).toHaveBeenCalledTimes(1);
  });

  it.each([0, -1, 26, 1.5, Number.NaN])(
    'rejects invalid collection resource page budget %s',
    async (limit) => {
      const { service, store, get } = setup();
      await expect(
        service.listResources(ownerId, collectionId, limit),
      ).rejects.toMatchObject({
        response: { code: 'STUDY_COLLECTION_PAGE_LIMIT_INVALID' },
      });
      expect(store.findOwned).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
    },
  );
});
