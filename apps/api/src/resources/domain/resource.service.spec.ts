import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { AcademicService } from '../../academic/domain/academic.service';
import type { FileService } from '../../files/domain/file.service';
import type { FileAssetRecord } from '../../files/domain/file.types';
import type { ProfileService } from '../../profile/domain/profile.service';
import type { ResourceStore } from './resource.store';
import { ResourceAssetUnavailableError } from './resource.store';
import { ResourceService } from './resource.service';
import type { ResourceRecord } from './resource.types';

const now = new Date('2026-09-23T12:00:00.000Z');

function resource(
  overrides: Partial<ResourceRecord> = {},
): ResourceRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    authorUserId: 'author-1',
    assetId: '22222222-2222-4222-8222-222222222222',
    title: 'Base de Datos',
    description: 'Resumen',
    tags: ['SQL'],
    searchText: 'base de datos resumen sql',
    subjectId: '33333333-3333-4333-8333-333333333333',
    courseOfferingId: null,
    visibility: 'private',
    moderationState: 'available',
    revision: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function asset(): FileAssetRecord {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    creatorUserId: 'author-1',
    purpose: 'resource-asset',
    provider: 's3',
    objectKey: 'private/object',
    originalFilename: 'apunte.pdf',
    declaredMimeType: 'application/pdf',
    verifiedMimeType: 'application/pdf',
    expectedByteSize: 8,
    actualByteSize: 8,
    state: 'ready',
    readyAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function store(): jest.Mocked<ResourceStore> {
  return {
    createClaimingAsset: jest.fn(),
    findById: jest.fn(),
    findManyByIds: jest.fn(),
    updateOwned: jest.fn(),
    hasShare: jest.fn(),
    upsertShare: jest.fn(),
    removeShare: jest.fn(),
    upsertSave: jest.fn(),
    removeSave: jest.fn(),
    listSavedResourceIds: jest.fn(),
    searchAuthorized: jest.fn(),
    upsertPendingReport: jest.fn(),
  };
}

type FileApi = Pick<
  FileService,
  'getReadyAssetForResource' | 'createAuthorizedDownloadIntent'
>;
type AcademicApi = Pick<
  AcademicService,
  'resolveResourceContext' | 'getCatalogNode'
>;
type ProfileApi = Pick<
  ProfileService,
  'getAttributionForUser' | 'resolveUserIdByProfileId'
>;

function dependencies() {
  const files: jest.Mocked<FileApi> = {
    getReadyAssetForResource: jest.fn(),
    createAuthorizedDownloadIntent: jest.fn(),
  };
  const academic: jest.Mocked<AcademicApi> = {
    resolveResourceContext: jest.fn(),
    getCatalogNode: jest.fn(),
  };
  const profiles: jest.Mocked<ProfileApi> = {
    getAttributionForUser: jest.fn(),
    resolveUserIdByProfileId: jest.fn(),
  };

  return { files, academic, profiles };
}

function service(
  resourceStore: jest.Mocked<ResourceStore>,
  deps: ReturnType<typeof dependencies>,
) {
  return new ResourceService(
    resourceStore,
    deps.files as unknown as FileService,
    deps.academic as unknown as AcademicService,
    deps.profiles as unknown as ProfileService,
  );
}

function projectionDeps(deps: ReturnType<typeof dependencies>) {
  deps.files.getReadyAssetForResource.mockResolvedValue(asset());
  deps.profiles.getAttributionForUser.mockResolvedValue({
    profileId: '44444444-4444-4444-8444-444444444444',
    displayName: 'Autor',
    avatarUrl: null,
  });
  deps.academic.getCatalogNode.mockResolvedValue({
    node: {
      id: '33333333-3333-4333-8333-333333333333',
      kind: 'subject',
      name: 'Base de Datos',
      aliases: [],
      parentIds: [],
      status: 'active',
      provenance: {
        authorityTier: 'C',
        sourceKey: 'test',
        sourceUrl: 'https://example.test',
      },
      revision: 1,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  } as never);
}

describe('ResourceService', () => {
  it('creates a normalized resource by atomically claiming a ready asset', async () => {
    const resourceStore = store();
    const deps = dependencies();
    const row = resource({ visibility: 'public' });
    deps.academic.resolveResourceContext.mockResolvedValue({
      subjectId: row.subjectId,
      courseOfferingId: null,
    });
    projectionDeps(deps);
    resourceStore.createClaimingAsset.mockResolvedValue({
      resource: row,
      asset: asset(),
    });

    const result = await service(resourceStore, deps).create(
      'author-1',
      {
        assetId: row.assetId,
        title: '  Base   de Datos ',
        description: ' Resumen ',
        tags: [' SQL ', 'sql'],
        subjectId: row.subjectId,
        visibility: 'public',
      },
      now,
    );

    expect(result.resource.id).toBe(row.id);
    const input = resourceStore.createClaimingAsset.mock.calls[0]?.[0];
    expect(input?.resource.title).toBe('Base de Datos');
    expect(input?.resource.tags).toEqual(['SQL']);
    expect(input?.resource.searchText).toContain('base de datos');
  });

  it('maps asset claim races to a stable conflict', async () => {
    const resourceStore = store();
    const deps = dependencies();
    deps.academic.resolveResourceContext.mockResolvedValue({
      subjectId: resource().subjectId,
      courseOfferingId: null,
    });
    resourceStore.createClaimingAsset.mockRejectedValue(
      new ResourceAssetUnavailableError(),
    );

    await expect(
      service(resourceStore, deps).create('author-1', {
        assetId: asset().id,
        title: 'Apunte',
        subjectId: resource().subjectId,
        visibility: 'private',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('keeps private and unrelated shared resources opaque', async () => {
    const resourceStore = store();
    const deps = dependencies();
    projectionDeps(deps);
    resourceStore.findById.mockResolvedValue(resource({ visibility: 'shared' }));
    resourceStore.hasShare.mockResolvedValue(false);

    await expect(
      service(resourceStore, deps).get(resource().id, 'viewer-2'),
    ).rejects.toBeInstanceOf(NotFoundException);

    resourceStore.findById.mockResolvedValue(
      resource({ visibility: 'shared' }),
    );
    await expect(
      service(resourceStore, deps).get(resource().id, 'viewer-2'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows public, author and exact explicit-share reads', async () => {
    const resourceStore = store();
    const deps = dependencies();
    projectionDeps(deps);
    const api = service(resourceStore, deps);

    resourceStore.findById.mockResolvedValue(
      resource({ visibility: 'public' }),
    );
    await expect(api.get(resource().id)).resolves.toHaveProperty(
      'resource.id',
      resource().id,
    );

    resourceStore.findById.mockResolvedValue(resource());
    await expect(api.get(resource().id, 'author-1')).resolves.toHaveProperty(
      'resource.id',
      resource().id,
    );

    resourceStore.findById.mockResolvedValue(
      resource({ visibility: 'shared' }),
    );
    resourceStore.hasShare.mockResolvedValue(true);
    await expect(api.get(resource().id, 'viewer-2')).resolves.toHaveProperty(
      'resource.id',
      resource().id,
    );
    expect(resourceStore.hasShare).toHaveBeenCalledWith(
      resource().id,
      'viewer-2',
    );
  });

  it('updates metadata with optimistic concurrency and rejects empty writes', async () => {
    const resourceStore = store();
    const deps = dependencies();
    projectionDeps(deps);
    resourceStore.findById.mockResolvedValue(resource());
    resourceStore.updateOwned.mockResolvedValue(
      resource({
        title: 'Nuevo',
        description: null,
        tags: ['SQL'],
        revision: 2,
      }),
    );

    const updated = await service(resourceStore, deps).update(
      'author-1',
      resource().id,
      {
        expectedRevision: 1,
        title: ' Nuevo ',
        description: null,
        tags: [' SQL ', 'sql'],
      },
    );
    expect(updated.resource.revision).toBe(2);

    await expect(
      service(resourceStore, deps).update('author-1', resource().id, {
        expectedRevision: 2,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    resourceStore.updateOwned.mockResolvedValue(null);
    await expect(
      service(resourceStore, deps).update('author-1', resource().id, {
        expectedRevision: 1,
        visibility: 'public',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('grants shares by stable Profile UUID and rejects self-share', async () => {
    const resourceStore = store();
    const deps = dependencies();
    resourceStore.findById.mockResolvedValue(resource());

    deps.profiles.resolveUserIdByProfileId.mockResolvedValueOnce('viewer-2');
    await expect(
      service(resourceStore, deps).grantShare(
        'author-1',
        resource().id,
        '44444444-4444-4444-8444-444444444444',
      ),
    ).resolves.toEqual({ shared: true });
    expect(resourceStore.upsertShare).toHaveBeenCalledWith(
      resource().id,
      'viewer-2',
    );

    deps.profiles.resolveUserIdByProfileId.mockResolvedValueOnce('author-1');
    await expect(
      service(resourceStore, deps).grantShare(
        'author-1',
        resource().id,
        '44444444-4444-4444-8444-444444444444',
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('refuses latent grants unless the resource is currently shared', async () => {
    const resourceStore = store();
    const deps = dependencies();
    resourceStore.findById.mockResolvedValue(
      resource({ visibility: 'private' }),
    );

    await expect(
      service(resourceStore, deps).grantShare(
        'author-1',
        resource().id,
        '44444444-4444-4444-8444-444444444444',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'RESOURCE_SHARE_VISIBILITY_REQUIRED',
      }),
    });

    expect(deps.profiles.resolveUserIdByProfileId).not.toHaveBeenCalled();
    expect(resourceStore.upsertShare).not.toHaveBeenCalled();
  });

  it('saved resources never grant access after privacy changes', async () => {
    const resourceStore = store();
    const deps = dependencies();
    projectionDeps(deps);
    resourceStore.listSavedResourceIds.mockResolvedValue(['a', 'b']);
    resourceStore.findManyByIds.mockResolvedValue([
      resource({ id: 'a', visibility: 'public' }),
      resource({ id: 'b', visibility: 'private' }),
    ]);

    const result = await service(resourceStore, deps).listSaved('viewer-2', 25);

    expect(result.items.map((item) => item.id)).toEqual(['a']);
  });

  it('search normalizes query and returns an opaque cursor', async () => {
    const resourceStore = store();
    const deps = dependencies();
    projectionDeps(deps);
    resourceStore.searchAuthorized.mockResolvedValue({
      items: [resource({ visibility: 'public' })],
      hasMore: true,
    });

    const result = await service(resourceStore, deps).search(undefined, {
      q: ' BASE   DE DATOS ',
      limit: 25,
    });

    expect(resourceStore.searchAuthorized).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'base de datos', limit: 25 }),
    );
    expect(typeof result.nextCursor).toBe('string');

    await expect(
      service(resourceStore, deps).search(undefined, {
        limit: 25,
        cursor: 'not-a-valid-cursor',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('reauthorizes before issuing a signed file access URL', async () => {
    const resourceStore = store();
    const deps = dependencies();
    const row = resource({ visibility: 'shared' });
    resourceStore.findById.mockResolvedValue(row);
    resourceStore.hasShare.mockResolvedValue(true);
    deps.files.getReadyAssetForResource.mockResolvedValue(asset());
    deps.files.createAuthorizedDownloadIntent.mockResolvedValue({
      url: 'http://storage.test/get',
      expiresAt: new Date(now.getTime() + 300_000).toISOString(),
    });

    const result = await service(resourceStore, deps).createAccessIntent(
      'viewer-2',
      row.id,
      'attachment',
    );

    expect(result.access.url).toContain('/get');
    expect(deps.files.createAuthorizedDownloadIntent).toHaveBeenCalledWith(
      expect.objectContaining({ disposition: 'attachment' }),
    );

    deps.files.getReadyAssetForResource.mockResolvedValue(null);
    await expect(
      service(resourceStore, deps).createAccessIntent(
        'viewer-2',
        row.id,
        'inline',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('creates one pending report relationship for readable content', async () => {
    const resourceStore = store();
    const deps = dependencies();
    resourceStore.findById.mockResolvedValue(
      resource({ visibility: 'public' }),
    );
    resourceStore.upsertPendingReport.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      resourceId: resource().id,
      reporterUserId: 'viewer-2',
      reason: 'plagiarism',
      details: 'Coincide con otra fuente',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });

    const result = await service(resourceStore, deps).report(
      'viewer-2',
      resource().id,
      'plagiarism',
      ' Coincide con otra fuente ',
    );

    expect(result.report.status).toBe('pending');
    expect(resourceStore.upsertPendingReport).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: resource().id,
        reporterUserId: 'viewer-2',
        details: 'Coincide con otra fuente',
      }),
    );
  });

  it('rethrows unexpected resource creation failures', async () => {
    const resourceStore = store();
    const deps = dependencies();
    deps.academic.resolveResourceContext.mockResolvedValue({
      subjectId: resource().subjectId,
      courseOfferingId: null,
    });
    const failure = new Error('database unavailable');
    resourceStore.createClaimingAsset.mockRejectedValue(failure);

    await expect(
      service(resourceStore, deps).create('author-1', {
        assetId: asset().id,
        title: 'Apunte',
        subjectId: resource().subjectId,
        visibility: 'private',
      }),
    ).rejects.toBe(failure);
  });

  it('decodes valid search cursors and supports subject and visibility filters', async () => {
    const resourceStore = store();
    const deps = dependencies();
    projectionDeps(deps);
    const row = resource({ visibility: 'public' });
    resourceStore.searchAuthorized
      .mockResolvedValueOnce({ items: [row], hasMore: true })
      .mockResolvedValueOnce({ items: [], hasMore: false });

    const first = await service(resourceStore, deps).search('viewer-2', {
      q: ' BASE ',
      subjectId: row.subjectId,
      visibility: 'public',
      limit: 25,
    });
    expect(first.nextCursor).toEqual(expect.any(String));

    await service(resourceStore, deps).search('viewer-2', {
      limit: 25,
      cursor: first.nextCursor!,
    });

    expect(resourceStore.searchAuthorized).toHaveBeenLastCalledWith(
      expect.objectContaining({
        viewerUserId: 'viewer-2',
        after: {
          updatedAt: row.updatedAt,
          id: row.id,
        },
      }),
    );
  });

  it('revokes shares without disclosing unknown profiles and supports save removal', async () => {
    const resourceStore = store();
    const deps = dependencies();
    const row = resource({ visibility: 'public' });
    resourceStore.findById.mockResolvedValue(row);

    deps.profiles.resolveUserIdByProfileId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('viewer-2');

    await expect(
      service(resourceStore, deps).revokeShare(
        'author-1',
        row.id,
        '44444444-4444-4444-8444-444444444444',
      ),
    ).resolves.toBeUndefined();
    expect(resourceStore.removeShare).not.toHaveBeenCalled();

    await service(resourceStore, deps).revokeShare(
      'author-1',
      row.id,
      '44444444-4444-4444-8444-444444444444',
    );
    expect(resourceStore.removeShare).toHaveBeenCalledWith(row.id, 'viewer-2');

    await expect(
      service(resourceStore, deps).save('viewer-2', row.id),
    ).resolves.toEqual({ saved: true });
    expect(resourceStore.upsertSave).toHaveBeenCalledWith(row.id, 'viewer-2');

    await service(resourceStore, deps).unsave('viewer-2', row.id);
    expect(resourceStore.removeSave).toHaveBeenCalledWith(row.id, 'viewer-2');
  });

  it('hides moderated resources and rejects cross-user owner mutations', async () => {
    const resourceStore = store();
    const deps = dependencies();
    resourceStore.findById.mockResolvedValue(
      resource({ moderationState: 'hidden', visibility: 'public' }),
    );

    await expect(
      service(resourceStore, deps).get(resource().id, 'viewer-2'),
    ).rejects.toBeInstanceOf(NotFoundException);

    resourceStore.findById.mockResolvedValue(resource());
    await expect(
      service(resourceStore, deps).update('viewer-2', resource().id, {
        expectedRevision: 1,
        visibility: 'public',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('projects a course offering and owner capabilities without exposing user ids', async () => {
    const resourceStore = store();
    const deps = dependencies();
    const row = resource({
      visibility: 'public',
      courseOfferingId: '66666666-6666-4666-8666-666666666666',
    });
    resourceStore.findById.mockResolvedValue(row);
    deps.files.getReadyAssetForResource.mockResolvedValue(asset());
    deps.profiles.getAttributionForUser.mockResolvedValue({
      profileId: '44444444-4444-4444-8444-444444444444',
      displayName: 'Autor',
      avatarUrl: null,
    });
    deps.academic.getCatalogNode
      .mockResolvedValueOnce({
        node: {
          id: row.subjectId,
          name: 'Base de Datos',
        },
      } as never)
      .mockResolvedValueOnce({
        node: {
          id: row.courseOfferingId,
          name: 'Base de Datos · 2026 S2',
        },
      } as never);

    const result = await service(resourceStore, deps).get(row.id, 'author-1');

    expect(result.resource.academic.courseOffering?.id).toBe(
      row.courseOfferingId,
    );
    expect(result.resource.capabilities).toEqual({
      edit: true,
      manageShares: true,
    });
    expect(JSON.stringify(result.resource)).not.toContain('authorUserId');
  });

  it('accepts reports without optional details', async () => {
    const resourceStore = store();
    const deps = dependencies();
    const row = resource({ visibility: 'public' });
    resourceStore.findById.mockResolvedValue(row);
    resourceStore.upsertPendingReport.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      resourceId: row.id,
      reporterUserId: 'viewer-2',
      reason: 'other',
      details: null,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });

    await service(resourceStore, deps).report('viewer-2', row.id, 'other');

    expect(resourceStore.upsertPendingReport).toHaveBeenCalledWith(
      expect.objectContaining({ details: null }),
    );
  });

  it('rejects decodable cursors with missing fields or invalid dates', async () => {
    const resourceStore = store();
    const deps = dependencies();

    const missingId = Buffer.from(
      JSON.stringify({ updatedAt: now.toISOString() }),
      'utf8',
    ).toString('base64url');
    await expect(
      service(resourceStore, deps).search(undefined, {
        limit: 25,
        cursor: missingId,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    const invalidDate = Buffer.from(
      JSON.stringify({ updatedAt: 'not-a-date', id: resource().id }),
      'utf8',
    ).toString('base64url');
    await expect(
      service(resourceStore, deps).search(undefined, {
        limit: 25,
        cursor: invalidDate,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('keeps unknown share targets opaque', async () => {
    const resourceStore = store();
    const deps = dependencies();
    resourceStore.findById.mockResolvedValue(resource());
    deps.profiles.resolveUserIdByProfileId.mockResolvedValue(null);

    await expect(
      service(resourceStore, deps).grantShare(
        'author-1',
        resource().id,
        '44444444-4444-4444-8444-444444444444',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(resourceStore.upsertShare).not.toHaveBeenCalled();
  });

  it('ignores orphaned saved relations instead of treating them as authority', async () => {
    const resourceStore = store();
    const deps = dependencies();
    projectionDeps(deps);

    resourceStore.listSavedResourceIds.mockResolvedValue([
      'missing',
      resource().id,
    ]);
    resourceStore.findManyByIds.mockResolvedValue([
      resource({ visibility: 'public' }),
    ]);

    const result = await service(resourceStore, deps).listSaved('viewer-2', 25);

    expect(result.items.map((item) => item.id)).toEqual([resource().id]);
  });

  it('normalizes blank optional metadata defensively', async () => {
    const resourceStore = store();
    const deps = dependencies();
    const row = resource({
      description: null,
      tags: [],
      visibility: 'private',
    });

    deps.academic.resolveResourceContext.mockResolvedValue({
      subjectId: row.subjectId,
      courseOfferingId: null,
    });
    projectionDeps(deps);
    resourceStore.createClaimingAsset.mockResolvedValue({
      resource: row,
      asset: asset(),
    });

    await service(resourceStore, deps).create(
      'author-1',
      {
        assetId: row.assetId,
        title: ' Apunte ',
        description: '   ',
        tags: [' SQL ', 'sql', '   '],
        subjectId: row.subjectId,
        visibility: 'private',
      },
      now,
    );

    const input = resourceStore.createClaimingAsset.mock.calls[0]?.[0];
    expect(input?.resource.description).toBeNull();
    expect(input?.resource.tags).toEqual(['SQL']);
  });

  it('fails closed when a ready asset is structurally incomplete', async () => {
    const resourceStore = store();
    const deps = dependencies();
    const row = resource({ visibility: 'public' });
    resourceStore.findById.mockResolvedValue(row);
    deps.files.getReadyAssetForResource.mockResolvedValue({
      ...asset(),
      verifiedMimeType: undefined,
      actualByteSize: undefined,
    });
    deps.profiles.getAttributionForUser.mockResolvedValue(null);
    deps.academic.getCatalogNode.mockResolvedValue({
      node: { id: row.subjectId, name: 'Base de Datos' },
    } as never);

    await expect(
      service(resourceStore, deps).get(row.id),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('does not project resources whose ready asset vanished', async () => {
    const resourceStore = store();
    const deps = dependencies();
    resourceStore.findById.mockResolvedValue(
      resource({ visibility: 'public' }),
    );
    deps.files.getReadyAssetForResource.mockResolvedValue(null);
    deps.profiles.getAttributionForUser.mockResolvedValue(null);
    deps.academic.getCatalogNode.mockResolvedValue({} as never);

    await expect(
      service(resourceStore, deps).get(resource().id),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
