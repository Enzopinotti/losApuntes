import {
  ConflictException,
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

function collection(overrides: Partial<StudyCollectionRecord> = {}): StudyCollectionRecord {
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
    list: jest.fn().mockResolvedValue({ items: row ? [row] : [], hasMore: false }),
    findOwned: jest.fn().mockImplementation(async (id: string, actor: string) =>
      row?.id === id && row.ownerUserId === actor ? row : null,
    ),
    updateOwned: jest.fn().mockResolvedValue(row),
    addResource: jest.fn().mockResolvedValue(row),
    removeResource: jest.fn().mockResolvedValue(row),
    deleteOwned: jest.fn().mockResolvedValue(Boolean(row)),
  };
  const get = jest.fn().mockImplementation(async (id: string) => ({
    resource: {
      id,
      title: 'Apunte de Álgebra',
      academic: { subject: { id: 'subject-id', name: 'Álgebra' } },
    },
  }));
  const service = new StudyCollectionService(
    store as unknown as StudyCollectionStore,
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
    store.findOwned.mockResolvedValueOnce(
      collection({ revision: 3 }),
    );
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
});
