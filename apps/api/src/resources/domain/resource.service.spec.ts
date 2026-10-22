import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { AcademicService } from '../../academic/domain/academic.service';
import type { FileService } from '../../files/domain/file.service';
import type { FileAssetRecord } from '../../files/domain/file.types';
import type { PilotEventService } from '../../pilot/telemetry/pilot-event.service';
import type { ProfileService } from '../../profile/domain/profile.service';
import type { ResourceStore } from './resource.store';
import { ResourceAssetUnavailableError } from './resource.store';
import type { ResourceExportStore } from './resource-export.store';
import { ResourceService } from './resource.service';
import type { ResourceRecord } from './resource.types';

const now = new Date('2026-09-23T12:00:00.000Z');

function resource(overrides: Partial<ResourceRecord> = {}): ResourceRecord {
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
    listShareGrants: jest.fn(),
    hasShare: jest.fn(),
    upsertShare: jest.fn(),
    removeShare: jest.fn(),
    upsertSave: jest.fn(),
    removeSave: jest.fn(),
    getOwnedStatistics: jest.fn(),
    listOwnedSubjects: jest.fn(),
    listOwnedResources: jest.fn(),
    listSavedResources: jest.fn(),
    searchAuthorized: jest.fn(),
    listFeedCandidates: jest.fn(),
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
  | 'getAttributionForUser'
  | 'getAttributionsForUsers'
  | 'resolveUserIdByProfileId'
  | 'getProfileIdsForAccountExport'
>;

function dependencies() {
  const exportStore: jest.Mocked<ResourceExportStore> = {
    listAuthoredResourcesForExport: jest.fn(),
    listAuthoredResourceShareGrantsForExport: jest.fn(),
    listSubmittedReportsForExport: jest.fn(),
  };
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
    getAttributionsForUsers: jest.fn(),
    resolveUserIdByProfileId: jest.fn(),
    getProfileIdsForAccountExport: jest.fn(),
  };
  const events = {
    recordBestEffort: jest.fn().mockResolvedValue(undefined),
  };

  return { exportStore, files, academic, profiles, events };
}

function service(
  resourceStore: jest.Mocked<ResourceStore>,
  deps: ReturnType<typeof dependencies>,
) {
  return new ResourceService(
    resourceStore,
    deps.exportStore,
    deps.files as unknown as FileService,
    deps.academic as unknown as AcademicService,
    deps.profiles as unknown as ProfileService,
    deps.events as unknown as PilotEventService,
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
  describe('owned statistics', () => {
    it('queries statistics only for authenticated account identity', async () => {
      const resourceStore = store();
      const deps = dependencies();
      resourceStore.getOwnedStatistics.mockResolvedValue({
        publications: { total: 3, private: 1, shared: 1, public: 1 },
        currentSaves: 7,
        activeShareGrants: 2,
        topResources: [
          {
            id: resource().id,
            title: 'Base de Datos',
            visibility: 'public',
            saves: 5,
            shareGrants: 0,
          },
        ],
      });

      const response = await service(resourceStore, deps).getOwnedStatistics(
        'author-1',
      );
      expect(resourceStore.getOwnedStatistics.mock.calls).toContainEqual([
        'author-1',
      ]);
      expect(response).toMatchObject({
        publications: { total: 3, private: 1, shared: 1, public: 1 },
        currentSaves: 7,
        activeShareGrants: 2,
        topResources: [
          {
            id: resource().id,
            saves: 5,
            shareGrants: 0,
          },
        ],
      });
      expect(new Date(response.generatedAt).toISOString()).toBe(
        response.generatedAt,
      );
      expect(JSON.stringify(response)).not.toContain('authorUserId');
      expect(deps.profiles.getAttributionForUser).not.toHaveBeenCalled();
    });

    it('returns genuine zero counts when there are no publications', async () => {
      const resourceStore = store();
      const deps = dependencies();
      resourceStore.getOwnedStatistics.mockResolvedValue({
        publications: { total: 0, private: 0, shared: 0, public: 0 },
        currentSaves: 0,
        activeShareGrants: 0,
        topResources: [],
      });
      const response = await service(resourceStore, deps).getOwnedStatistics(
        'author-2',
      );
      expect(response.currentSaves).toBe(0);
      expect(response.activeShareGrants).toBe(0);
      expect(response.topResources).toEqual([]);
    });
  });

  describe('owner publications filters', () => {
    it('normalizes search and binds all filters to the first page', async () => {
      const resourceStore = store();
      const deps = dependencies();
      projectionDeps(deps);
      const item = resource({ visibility: 'shared' });
      resourceStore.listOwnedResources.mockResolvedValue({
        items: [item],
        hasMore: true,
      });
      const first = await service(resourceStore, deps).listOwned('author-1', {
        limit: 2,
        visibility: 'shared',
        q: '  ÁLGEBRA   avanzada  ',
        subjectId: item.subjectId,
        order: 'oldest',
      });
      expect(resourceStore.listOwnedResources.mock.calls).toContainEqual([
        {
          authorUserId: 'author-1',
          limit: 2,
          visibility: 'shared',
          q: 'álgebra avanzada',
          subjectId: item.subjectId,
          order: 'oldest',
        },
      ]);
      expect(first.nextCursor).toEqual(expect.any(String));
      await service(resourceStore, deps).listOwned('author-1', {
        limit: 2,
        visibility: 'shared',
        q: 'Álgebra avanzada',
        subjectId: item.subjectId,
        order: 'oldest',
        cursor: first.nextCursor!,
      });
      expect(resourceStore.listOwnedResources.mock.calls.at(-1)).toEqual([
        {
          authorUserId: 'author-1',
          limit: 2,
          visibility: 'shared',
          q: 'álgebra avanzada',
          subjectId: item.subjectId,
          order: 'oldest',
          after: { createdAt: item.createdAt, id: item.id },
        },
      ]);
    });

    it('rejects a cursor on different filters before querying Mongo', async () => {
      const resourceStore = store();
      const deps = dependencies();
      const token = Buffer.from(
        JSON.stringify({
          v: 2,
          id: resource().id,
          createdAt: now.toISOString(),
          visibility: null,
          q: 'álgebra',
          subjectId: null,
          order: 'newest',
        }),
      ).toString('base64url');
      await expect(
        service(resourceStore, deps).listOwned('author-1', {
          q: 'química',
          limit: 25,
          cursor: token,
        }),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(resourceStore.listOwnedResources.mock.calls).toHaveLength(0);
    });

    it('lists up to fifty subjects from only the author records with academic names', async () => {
      const resourceStore = store();
      const deps = dependencies();
      resourceStore.listOwnedSubjects.mockResolvedValue({
        items: [{ subjectId: resource().subjectId, count: 8 }],
        truncated: false,
      });
      deps.academic.getCatalogNode.mockResolvedValue({
        node: { name: 'Base de Datos' },
      } as never);
      expect(
        await service(resourceStore, deps).listOwnedSubjects('author-1'),
      ).toEqual({
        items: [
          {
            subjectId: resource().subjectId,
            name: 'Base de Datos',
            count: 8,
          },
        ],
        truncated: false,
      });
      expect(resourceStore.listOwnedSubjects.mock.calls).toContainEqual([
        'author-1',
      ]);
      expect(deps.academic.getCatalogNode).toHaveBeenCalledWith(
        resource().subjectId,
      );
    });
  });

  describe('owner publications library', () => {
    it('queries only the authenticated author and includes private resources', async () => {
      const resourceStore = store();
      const deps = dependencies();
      projectionDeps(deps);
      const owned = resource({
        visibility: 'private',
        authorUserId: 'author-1',
      });
      resourceStore.listOwnedResources.mockResolvedValue({
        items: [owned],
        hasMore: false,
      });

      const response = await service(resourceStore, deps).listOwned(
        'author-1',
        { limit: 25 },
      );

      expect(resourceStore.listOwnedResources.mock.calls).toContainEqual([
        {
          authorUserId: 'author-1',
          limit: 25,
        },
      ]);
      expect(response.items).toHaveLength(1);
      expect(response.items[0]).toMatchObject({
        id: owned.id,
        visibility: 'private',
        capabilities: { edit: true, manageShares: true },
      });
      expect(response.nextCursor).toBeNull();
      expect(JSON.stringify(response)).not.toContain('authorUserId');
    });

    it('continues using the same server-side visibility filter', async () => {
      const resourceStore = store();
      const deps = dependencies();
      projectionDeps(deps);
      const item = resource({ visibility: 'shared' });
      resourceStore.listOwnedResources.mockResolvedValue({
        items: [item],
        hasMore: true,
      });
      const api = service(resourceStore, deps);
      const first = await api.listOwned('author-1', {
        limit: 1,
        visibility: 'shared',
      });
      expect(first.nextCursor).toEqual(expect.any(String));
      const second = await api.listOwned('author-1', {
        limit: 1,
        visibility: 'shared',
        cursor: first.nextCursor!,
      });
      expect(resourceStore.listOwnedResources.mock.calls[1]).toEqual([
        {
          authorUserId: 'author-1',
          visibility: 'shared',
          limit: 1,
          after: { createdAt: item.createdAt, id: item.id },
        },
      ]);
      expect(second.items).toHaveLength(1);
    });

    it('refuses cross-filter cursors before querying data', async () => {
      const resourceStore = store();
      const deps = dependencies();
      const token = Buffer.from(
        JSON.stringify({
          v: 1,
          id: resource().id,
          createdAt: now.toISOString(),
          visibility: 'public',
        }),
      ).toString('base64url');

      await expect(
        service(resourceStore, deps).listOwned('author-1', {
          limit: 25,
          visibility: 'private',
          cursor: token,
        }),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(resourceStore.listOwnedResources.mock.calls).toHaveLength(0);
    });

    it('returns an empty page without projecting other authors', async () => {
      const resourceStore = store();
      const deps = dependencies();
      resourceStore.listOwnedResources.mockResolvedValue({
        items: [],
        hasMore: false,
      });
      const response = await service(resourceStore, deps).listOwned(
        'author-1',
        { limit: 25, visibility: 'public' },
      );
      expect(response).toEqual({ items: [], nextCursor: null });
      expect(deps.profiles.getAttributionForUser).not.toHaveBeenCalled();
    });
  });

  describe('owner-only share grants listing', () => {
    const resourceId = resource().id;

    it('rejects another user before querying or revealing recipients', async () => {
      const resourceStore = store();
      const deps = dependencies();
      resourceStore.findById.mockResolvedValue(
        resource({
          visibility: 'shared',
        }),
      );

      await expect(
        service(resourceStore, deps).listShareGrants(
          'intruder',
          resourceId,
          20,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(resourceStore.listShareGrants.mock.calls).toHaveLength(0);
      expect(deps.profiles.getAttributionsForUsers).not.toHaveBeenCalled();
    });

    it('blocks listing when resource is no longer shared', async () => {
      const resourceStore = store();
      const deps = dependencies();
      resourceStore.findById.mockResolvedValue(
        resource({
          visibility: 'private',
        }),
      );

      await expect(
        service(resourceStore, deps).listShareGrants(
          'author-1',
          resourceId,
          20,
        ),
      ).rejects.toThrow(ConflictException);
      expect(resourceStore.listShareGrants.mock.calls).toHaveLength(0);
    });

    it('returns public profile data only and hides internal user identifiers', async () => {
      const resourceStore = store();
      const deps = dependencies();
      resourceStore.findById.mockResolvedValue(
        resource({
          visibility: 'shared',
          revision: 7,
        }),
      );
      resourceStore.listShareGrants.mockResolvedValue({
        items: [
          {
            shareId: '507f1f77bcf86cd799439011',
            userId: 'internal-user-1',
            createdAt: now,
          },
          {
            shareId: '507f1f77bcf86cd799439012',
            userId: 'internal-user-2',
            createdAt: now,
          },
        ],
        hasMore: true,
      });
      deps.profiles.getAttributionsForUsers.mockResolvedValue(
        new Map([
          [
            'internal-user-1',
            {
              profileId: 'public-profile-1',
              displayName: 'Lucía',
              avatarUrl: null,
            },
          ],
          [
            'internal-user-2',
            {
              profileId: 'public-profile-2',
              displayName: 'Usuario de Los Apuntes',
              avatarUrl: null,
            },
          ],
        ]),
      );

      const result = await service(resourceStore, deps).listShareGrants(
        'author-1',
        resourceId,
        2,
      );
      expect(result.items).toEqual([
        {
          profileId: 'public-profile-1',
          displayName: 'Lucía',
          avatarUrl: null,
          grantedAt: now.toISOString(),
        },
        {
          profileId: 'public-profile-2',
          displayName: 'Usuario de Los Apuntes',
          avatarUrl: null,
          grantedAt: now.toISOString(),
        },
      ]);
      expect(result.resourceRevision).toBe(7);
      expect(result.nextCursor).toEqual(expect.any(String));
      expect(JSON.stringify(result)).not.toContain('internal-user');
      expect(resourceStore.listShareGrants.mock.calls).toContainEqual([
        {
          resourceId,
          limit: 2,
        },
      ]);
      expect(deps.profiles.getAttributionsForUsers).toHaveBeenCalledWith([
        'internal-user-1',
        'internal-user-2',
      ]);
    });

    it('resumes pagination by share document, not user identity', async () => {
      const resourceStore = store();
      const deps = dependencies();
      resourceStore.findById.mockResolvedValue(
        resource({
          visibility: 'shared',
          revision: 2,
        }),
      );
      resourceStore.listShareGrants.mockResolvedValue({
        items: [
          {
            shareId: '507f1f77bcf86cd799439013',
            userId: 'internal-user-3',
            createdAt: now,
          },
        ],
        hasMore: false,
      });
      deps.profiles.getAttributionsForUsers.mockResolvedValue(new Map());
      const cursor = Buffer.from(
        JSON.stringify({
          v: 1,
          resourceId,
          resourceRevision: 2,
          shareId: '507f1f77bcf86cd799439011',
        }),
        'utf8',
      ).toString('base64url');

      const result = await service(resourceStore, deps).listShareGrants(
        'author-1',
        resourceId,
        10,
        cursor,
      );
      expect(resourceStore.listShareGrants.mock.calls).toContainEqual([
        {
          resourceId,
          limit: 10,
          after: { shareId: '507f1f77bcf86cd799439011' },
        },
      ]);
      expect(result.items).toEqual([]);
      expect(result.nextCursor).toBeNull();
    });
  });

  it('exports only bounded owner-authored metadata, including private and hidden history', async () => {
    const resourceStore = store();
    const deps = dependencies();
    deps.exportStore.listAuthoredResourcesForExport.mockResolvedValue({
      items: [
        {
          ...resource({
            id: 'resource-a',
            visibility: 'private',
            moderationState: 'hidden',
          }),
        },
        {
          ...resource({ id: 'resource-b', visibility: 'shared' }),
        },
      ],
      hasMore: true,
    });
    const api = service(resourceStore, deps);
    const cursor = Buffer.from(JSON.stringify({ id: 'resource-0' })).toString(
      'base64url',
    );

    const result = await api.listAccountExportResources('owner-1', {
      limit: 2,
      cursor,
    });

    expect(deps.exportStore.listAuthoredResourcesForExport.mock.calls).toEqual([
      [
        {
          authorUserId: 'owner-1',
          limit: 2,
          afterId: 'resource-0',
        },
      ],
    ]);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      id: 'resource-a',
      visibility: 'private',
      moderationState: 'hidden',
    });
    expect(result.items[0]).not.toHaveProperty('authorUserId');
    expect(result.items[0]).not.toHaveProperty('assetId');
    expect(result.items[0]).not.toHaveProperty('searchText');
    expect(result.nextCursor).toBe(
      Buffer.from(JSON.stringify({ id: 'resource-b' })).toString('base64url'),
    );
    expect(deps.files.getReadyAssetForResource.mock.calls).toHaveLength(0);
    expect(deps.academic.getCatalogNode.mock.calls).toHaveLength(0);
    expect(deps.profiles.getAttributionForUser.mock.calls).toHaveLength(0);
  });

  it('rejects invalid Resource export cursors and unbounded page sizes', async () => {
    const resourceStore = store();
    const deps = dependencies();
    const api = service(resourceStore, deps);

    await expect(
      api.listAccountExportResources('owner-1', {
        limit: 100,
        cursor: 'invalid',
      }),
    ).rejects.toMatchObject({
      response: { code: 'RESOURCE_EXPORT_CURSOR_INVALID' },
    });
    await expect(
      api.listAccountExportResources('owner-1', {
        limit: 101,
        cursor: null,
      }),
    ).rejects.toMatchObject({
      response: { code: 'RESOURCE_EXPORT_PAGE_LIMIT_INVALID' },
    });
    expect(
      deps.exportStore.listAuthoredResourcesForExport.mock.calls,
    ).toHaveLength(0);
  });

  it('exports saved references without filtering current target readability', async () => {
    const resourceStore = store();
    const deps = dependencies();
    resourceStore.listSavedResources.mockResolvedValue({
      items: [
        {
          resourceId: 'resource-no-longer-readable',
          createdAt: now,
        },
      ],
      hasMore: true,
    });
    const api = service(resourceStore, deps);

    const result = await api.listAccountExportSaves('owner-1', {
      limit: 10,
      cursor: null,
    });

    expect(resourceStore.listSavedResources.mock.calls).toEqual([
      [
        {
          userId: 'owner-1',
          limit: 10,
          after: undefined,
        },
      ],
    ]);
    expect(result.items).toEqual([
      {
        resourceId: 'resource-no-longer-readable',
        savedAt: now.toISOString(),
      },
    ]);
    expect(
      JSON.parse(Buffer.from(result.nextCursor!, 'base64url').toString()),
    ).toEqual({
      createdAt: now.toISOString(),
      resourceId: 'resource-no-longer-readable',
    });
    expect(resourceStore.findManyByIds.mock.calls).toHaveLength(0);
    expect(resourceStore.hasShare.mock.calls).toHaveLength(0);
    expect(deps.files.getReadyAssetForResource.mock.calls).toHaveLength(0);
  });

  it('exports only explicit grant metadata and stable recipient Profile ids', async () => {
    const resourceStore = store();
    const deps = dependencies();
    const cursor = Buffer.from(
      JSON.stringify({
        resourceId: 'resource-owned',
        granteeUserId: 'grantee-user-before',
      }),
    ).toString('base64url');
    deps.exportStore.listAuthoredResourceShareGrantsForExport.mockResolvedValue(
      {
        items: [
          {
            resourceId: 'resource-owned',
            granteeUserId: 'grantee-user-internal',
            grantedAt: now,
          },
        ],
        nextCursor: {
          resourceId: 'resource-owned',
          granteeUserId: 'grantee-user-internal',
        },
      },
    );
    deps.profiles.getProfileIdsForAccountExport.mockResolvedValue(
      new Map([['grantee-user-internal', 'grantee-profile-public-id']]),
    );

    const result = await service(
      resourceStore,
      deps,
    ).listAccountExportShareGrants('owner-1', { limit: 25, cursor });

    expect(
      deps.exportStore.listAuthoredResourceShareGrantsForExport.mock.calls,
    ).toEqual([
      [
        {
          authorUserId: 'owner-1',
          limit: 25,
          after: {
            resourceId: 'resource-owned',
            granteeUserId: 'grantee-user-before',
          },
        },
      ],
    ]);
    expect(deps.profiles.getProfileIdsForAccountExport.mock.calls).toEqual([
      [['grantee-user-internal']],
    ]);
    expect(result.items).toEqual([
      {
        resourceId: 'resource-owned',
        granteeProfileId: 'grantee-profile-public-id',
        grantedAt: now.toISOString(),
      },
    ]);
    expect(result.items[0]).not.toHaveProperty('granteeUserId');
    expect(result.items[0]).not.toHaveProperty('displayName');
    expect(
      JSON.parse(Buffer.from(result.nextCursor!, 'base64url').toString()),
    ).toEqual({
      resourceId: 'resource-owned',
      granteeUserId: 'grantee-user-internal',
    });
    expect(deps.files.getReadyAssetForResource).not.toHaveBeenCalled();
  });

  it('advances an empty share page with a resource-only cursor', async () => {
    const deps = dependencies();
    const nextCursor = { resourceId: 'resource-scan-boundary' };
    deps.exportStore.listAuthoredResourceShareGrantsForExport.mockResolvedValue(
      {
        items: [],
        nextCursor,
      },
    );
    deps.profiles.getProfileIdsForAccountExport.mockResolvedValue(new Map());
    const inputCursor = Buffer.from(
      JSON.stringify({ resourceId: 'resource-previous-boundary' }),
    ).toString('base64url');

    const result = await service(store(), deps).listAccountExportShareGrants(
      'owner-1',
      {
        limit: 25,
        cursor: inputCursor,
      },
    );

    expect(
      deps.exportStore.listAuthoredResourceShareGrantsForExport.mock.calls,
    ).toEqual([
      [
        {
          authorUserId: 'owner-1',
          limit: 25,
          after: { resourceId: 'resource-previous-boundary' },
        },
      ],
    ]);
    expect(deps.profiles.getProfileIdsForAccountExport.mock.calls).toEqual([
      [[]],
    ]);
    expect(result.items).toEqual([]);
    expect(
      JSON.parse(Buffer.from(result.nextCursor!, 'base64url').toString()),
    ).toEqual(nextCursor);
  });

  it('finishes an empty share section without a continuation cursor', async () => {
    const deps = dependencies();
    deps.exportStore.listAuthoredResourceShareGrantsForExport.mockResolvedValue(
      {
        items: [],
        nextCursor: null,
      },
    );
    deps.profiles.getProfileIdsForAccountExport.mockResolvedValue(new Map());

    await expect(
      service(store(), deps).listAccountExportShareGrants('owner-1', {
        limit: 25,
        cursor: null,
      }),
    ).resolves.toEqual({ items: [], nextCursor: null });
    expect(deps.profiles.getProfileIdsForAccountExport.mock.calls).toEqual([
      [[]],
    ]);
  });

  it('aborts a share export page when a grant has no stable recipient Profile', async () => {
    const deps = dependencies();
    deps.exportStore.listAuthoredResourceShareGrantsForExport.mockResolvedValue(
      {
        items: [
          {
            resourceId: 'resource-owned',
            granteeUserId: 'missing-profile-user',
            grantedAt: now,
          },
        ],
        nextCursor: null,
      },
    );
    deps.profiles.getProfileIdsForAccountExport.mockResolvedValue(new Map());

    await expect(
      service(store(), deps).listAccountExportShareGrants('owner-1', {
        limit: 25,
        cursor: null,
      }),
    ).rejects.toThrow(
      'Resource share export references a missing recipient Profile',
    );
  });

  it('rejects malformed share cursors and page sizes before querying', async () => {
    const deps = dependencies();
    const api = service(store(), deps);

    await expect(
      api.listAccountExportShareGrants('owner-1', {
        limit: 100,
        cursor: Buffer.from(
          JSON.stringify({ resourceId: 'resource-1', userId: 'internal-id' }),
        ).toString('base64url'),
      }),
    ).rejects.toMatchObject({
      response: { code: 'RESOURCE_SHARE_EXPORT_CURSOR_INVALID' },
    });
    await expect(
      api.listAccountExportShareGrants('owner-1', { limit: 101, cursor: null }),
    ).rejects.toMatchObject({
      response: { code: 'RESOURCE_EXPORT_PAGE_LIMIT_INVALID' },
    });
    expect(
      deps.exportStore.listAuthoredResourceShareGrantsForExport.mock.calls,
    ).toHaveLength(0);
  });

  it('exports only the owner submitted Resource report without review outcomes or target lookup', async () => {
    const deps = dependencies();
    const cursor = Buffer.from(
      JSON.stringify({ id: 'report-before' }),
    ).toString('base64url');
    deps.exportStore.listSubmittedReportsForExport.mockResolvedValue({
      items: [
        {
          id: 'resource-report-1',
          resourceId: 'moderated-resource-ref',
          reason: 'copyright',
          details: 'I submitted this report.',
          createdAt: now,
          status: 'resolved',
          updatedAt: new Date('2026-09-24T12:00:00.000Z'),
          reviewedByUserId: 'moderator-user',
          reviewedAt: new Date('2026-09-24T13:00:00.000Z'),
          reviewReason: 'Internal decision',
          reviewAction: 'hide',
        } as never,
      ],
      hasMore: true,
    });

    const result = await service(
      store(),
      deps,
    ).listAccountExportSubmittedReports('owner-1', { limit: 1, cursor });

    expect(deps.exportStore.listSubmittedReportsForExport.mock.calls).toEqual([
      [
        {
          reporterUserId: 'owner-1',
          limit: 1,
          afterId: 'report-before',
        },
      ],
    ]);
    expect(result).toEqual({
      items: [
        {
          id: 'resource-report-1',
          resourceId: 'moderated-resource-ref',
          reason: 'copyright',
          details: 'I submitted this report.',
          createdAt: now.toISOString(),
        },
      ],
      nextCursor: Buffer.from(
        JSON.stringify({ id: 'resource-report-1' }),
      ).toString('base64url'),
    });
    for (const key of [
      'reporterUserId',
      'status',
      'updatedAt',
      'reviewedByUserId',
      'reviewedAt',
      'reviewReason',
      'reviewAction',
    ]) {
      expect(result.items[0]).not.toHaveProperty(key);
    }
    expect(deps.files.getReadyAssetForResource).not.toHaveBeenCalled();
    expect(deps.profiles.getProfileIdsForAccountExport).not.toHaveBeenCalled();
  });

  it('validates Resource report export cursor and page size before querying', async () => {
    const deps = dependencies();
    const api = service(store(), deps);

    await expect(
      api.listAccountExportSubmittedReports('owner-1', {
        limit: 100,
        cursor: Buffer.from(
          JSON.stringify({ id: 'report-1', reporterUserId: 'internal-user' }),
        ).toString('base64url'),
      }),
    ).rejects.toMatchObject({
      response: { code: 'RESOURCE_EXPORT_CURSOR_INVALID' },
    });
    await expect(
      api.listAccountExportSubmittedReports('owner-1', {
        limit: 101,
        cursor: null,
      }),
    ).rejects.toMatchObject({
      response: { code: 'RESOURCE_EXPORT_PAGE_LIMIT_INVALID' },
    });
    expect(
      deps.exportStore.listSubmittedReportsForExport.mock.calls,
    ).toHaveLength(0);
  });

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
    resourceStore.findById.mockResolvedValue(resource());
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
    expect(resourceStore.hasShare.mock.calls).toContainEqual([
      resource().id,
      'viewer-2',
    ]);
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
    resourceStore.findById.mockResolvedValue(
      resource({ visibility: 'shared' }),
    );

    deps.profiles.resolveUserIdByProfileId.mockResolvedValueOnce('viewer-2');
    await expect(
      service(resourceStore, deps).grantShare(
        'author-1',
        resource().id,
        '44444444-4444-4444-8444-444444444444',
      ),
    ).resolves.toEqual({ shared: true });
    expect(resourceStore.upsertShare.mock.calls).toContainEqual([
      resource().id,
      'viewer-2',
    ]);

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

    try {
      await service(resourceStore, deps).grantShare(
        'author-1',
        resource().id,
        '44444444-4444-4444-8444-444444444444',
      );
      throw new Error('Expected share visibility conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      if (!(error instanceof ConflictException)) throw error;
      expect(error.getResponse()).toEqual({
        code: 'RESOURCE_SHARE_VISIBILITY_REQUIRED',
        message: 'Resource must be shared before granting explicit access',
      });
    }

    expect(deps.profiles.resolveUserIdByProfileId.mock.calls).toHaveLength(0);
    expect(resourceStore.upsertShare.mock.calls).toHaveLength(0);
  });

  it('saved resources never grant access after privacy changes', async () => {
    const resourceStore = store();
    const deps = dependencies();
    projectionDeps(deps);
    resourceStore.listSavedResources.mockResolvedValue({
      items: [
        { resourceId: 'a', createdAt: now },
        { resourceId: 'b', createdAt: new Date(now.getTime() - 1_000) },
      ],
      hasMore: false,
    });
    resourceStore.findManyByIds.mockResolvedValue([
      resource({ id: 'a', visibility: 'public' }),
      resource({ id: 'b', visibility: 'private' }),
    ]);

    const result = await service(resourceStore, deps).listSaved('viewer-2', 25);

    expect(result.items.map((item) => item.id)).toEqual(['a']);
  });

  it('continues saved resources with an opaque stable cursor', async () => {
    const resourceStore = store();
    const deps = dependencies();
    projectionDeps(deps);
    const firstId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const secondId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const firstCreatedAt = new Date('2026-09-23T12:00:00.000Z');

    resourceStore.listSavedResources
      .mockResolvedValueOnce({
        items: [{ resourceId: firstId, createdAt: firstCreatedAt }],
        hasMore: true,
      })
      .mockResolvedValueOnce({
        items: [
          {
            resourceId: secondId,
            createdAt: new Date(firstCreatedAt.getTime() - 1_000),
          },
        ],
        hasMore: false,
      });
    resourceStore.findManyByIds
      .mockResolvedValueOnce([resource({ id: firstId, visibility: 'public' })])
      .mockResolvedValueOnce([
        resource({ id: secondId, visibility: 'public' }),
      ]);

    const instance = service(resourceStore, deps);
    const first = await instance.listSaved('viewer-2', 1);
    expect(first.items.map((item) => item.id)).toEqual([firstId]);
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await instance.listSaved(
      'viewer-2',
      1,
      first.nextCursor ?? undefined,
    );
    expect(second.items.map((item) => item.id)).toEqual([secondId]);
    expect(second.nextCursor).toBeNull();
    expect(resourceStore.listSavedResources.mock.calls.at(-1)).toEqual([
      {
        userId: 'viewer-2',
        limit: 1,
        after: {
          createdAt: firstCreatedAt,
          resourceId: firstId,
        },
      },
    ]);
  });

  it('rejects malformed saved-resource cursors before persistence', async () => {
    const resourceStore = store();
    const deps = dependencies();

    await expect(
      service(resourceStore, deps).listSaved(
        'viewer-2',
        25,
        'invalid-saved-cursor',
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(resourceStore.listSavedResources.mock.calls).toHaveLength(0);
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

    expect(resourceStore.searchAuthorized.mock.calls[0]?.[0]).toEqual(
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

  it('B126 preserves the viewer, academic filters, anchor and page bound when requesting feed candidates', async () => {
    const resourceStore = store();
    const deps = dependencies();
    const subjectId = resource().subjectId;
    const candidate = resource({ visibility: 'public' });
    const filters = {
      subjectIds: [subjectId],
      authorUserIds: ['author-1'],
      anchorAt: new Date('2026-09-23T11:45:00.000Z'),
      limit: 17,
    };
    resourceStore.listFeedCandidates.mockResolvedValueOnce([candidate]);
    resourceStore.listFeedCandidates.mockResolvedValueOnce([]);

    const api = service(resourceStore, deps);
    const result = await api.getFeedCandidates('viewer-2', filters);
    expect(result).toEqual([candidate]);
    expect(resourceStore.listFeedCandidates.mock.calls[0]).toEqual([
      { viewerUserId: 'viewer-2', ...filters },
    ]);

    // An empty authorized store page must stay empty: the facade must not
    // backfill candidates from another viewer or re-project hidden files.
    const empty = await api.getFeedCandidates('viewer-3', {
      anchorAt: filters.anchorAt,
      limit: 1,
    });
    expect(empty).toEqual([]);
    expect(resourceStore.listFeedCandidates.mock.calls[1]).toEqual([
      { viewerUserId: 'viewer-3', anchorAt: filters.anchorAt, limit: 1 },
    ]);
    expect(resourceStore.listFeedCandidates.mock.calls).toHaveLength(2);
    expect(deps.files.getReadyAssetForResource.mock.calls).toHaveLength(0);
    expect(deps.profiles.getAttributionForUser.mock.calls).toHaveLength(0);
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
    expect(resourceStore.upsertPendingReport.mock.calls[0]?.[0]).toEqual(
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
    const mergedSubjectId = '77777777-7777-4777-8777-777777777777';
    deps.academic.resolveResourceContext.mockResolvedValue({
      subjectId: row.subjectId,
      courseOfferingId: null,
    });
    resourceStore.searchAuthorized
      .mockResolvedValueOnce({ items: [row], hasMore: true })
      .mockResolvedValueOnce({ items: [], hasMore: false });

    const first = await service(resourceStore, deps).search('viewer-2', {
      q: ' BASE ',
      subjectId: mergedSubjectId,
      visibility: 'public',
      limit: 25,
    });
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(deps.academic.resolveResourceContext.mock.calls).toContainEqual([
      mergedSubjectId,
    ]);
    expect(resourceStore.searchAuthorized.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        subjectId: row.subjectId,
        visibility: 'public',
      }),
    );

    await service(resourceStore, deps).search('viewer-2', {
      limit: 25,
      cursor: first.nextCursor!,
    });

    expect(resourceStore.searchAuthorized.mock.calls.at(-1)?.[0]).toEqual(
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
    expect(resourceStore.removeShare.mock.calls).toHaveLength(0);

    await service(resourceStore, deps).revokeShare(
      'author-1',
      row.id,
      '44444444-4444-4444-8444-444444444444',
    );
    expect(resourceStore.removeShare.mock.calls).toContainEqual([
      row.id,
      'viewer-2',
    ]);

    await expect(
      service(resourceStore, deps).save('viewer-2', row.id),
    ).resolves.toEqual({ saved: true });
    expect(resourceStore.upsertSave.mock.calls).toContainEqual([
      row.id,
      'viewer-2',
    ]);

    await service(resourceStore, deps).unsave('viewer-2', row.id);
    expect(resourceStore.removeSave.mock.calls).toContainEqual([
      row.id,
      'viewer-2',
    ]);
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

    expect(resourceStore.upsertPendingReport.mock.calls[0]?.[0]).toEqual(
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
    resourceStore.findById.mockResolvedValue(
      resource({ visibility: 'shared' }),
    );
    deps.profiles.resolveUserIdByProfileId.mockResolvedValue(null);

    await expect(
      service(resourceStore, deps).grantShare(
        'author-1',
        resource().id,
        '44444444-4444-4444-8444-444444444444',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(resourceStore.upsertShare.mock.calls).toHaveLength(0);
  });

  it('ignores orphaned saved relations instead of treating them as authority', async () => {
    const resourceStore = store();
    const deps = dependencies();
    projectionDeps(deps);

    resourceStore.listSavedResources.mockResolvedValue({
      items: [
        { resourceId: 'missing', createdAt: now },
        {
          resourceId: resource().id,
          createdAt: new Date(now.getTime() - 1_000),
        },
      ],
      hasMore: false,
    });
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
