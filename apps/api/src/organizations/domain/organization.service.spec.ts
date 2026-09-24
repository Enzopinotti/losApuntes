import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { AcademicService } from '../../academic/domain/academic.service';
import type { ProfileService } from '../../profile/domain/profile.service';
import type { ResourceService } from '../../resources/domain/resource.service';
import type { OrganizationStore } from './organization.store';
import { OrganizationService } from './organization.service';
import type {
  OrganizationEventRecord,
  OrganizationManagerRecord,
  OrganizationPostRecord,
  OrganizationRecord,
} from './organization.types';

const now = new Date('2026-09-24T04:00:00.000Z');
const orgId = '11111111-1111-4111-8111-111111111111';
const institutionId = '22222222-2222-4222-8222-222222222222';
const profileId = '33333333-3333-4333-8333-333333333333';

function organization(
  overrides: Partial<OrganizationRecord> = {},
): OrganizationRecord {
  return {
    id: orgId,
    name: 'Centro de Estudiantes',
    normalizedName: 'centro de estudiantes',
    type: 'student_center',
    about: null,
    avatarUrl: null,
    coverUrl: null,
    websiteUrl: null,
    institutionId,
    campusId: null,
    academicUnitId: null,
    programId: null,
    claimState: 'claimed',
    verificationState: 'unverified',
    status: 'active',
    revision: 1,
    managementRevision: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function manager(
  role: OrganizationManagerRecord['role'] = 'owner',
  userId = 'owner-user',
): OrganizationManagerRecord {
  return {
    organizationId: orgId,
    userId,
    role,
    createdAt: now,
    updatedAt: now,
  };
}

function post(
  overrides: Partial<OrganizationPostRecord> = {},
): OrganizationPostRecord {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    organizationId: orgId,
    createdByUserId: 'owner-user',
    title: 'Novedad',
    body: 'Información útil para la comunidad',
    subjectId: null,
    moderationState: 'available',
    revision: 1,
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function event(
  overrides: Partial<OrganizationEventRecord> = {},
): OrganizationEventRecord {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    organizationId: orgId,
    createdByUserId: 'owner-user',
    title: 'Encuentro',
    description: null,
    startsAt: now,
    endsAt: null,
    locationLabel: null,
    externalUrl: null,
    state: 'scheduled',
    moderationState: 'available',
    revision: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function store(): jest.Mocked<OrganizationStore> {
  return {
    createWithOwner: jest.fn(),
    findById: jest.fn(),
    findManyByIds: jest.fn(),
    search: jest.fn(),
    updateOwnedProfile: jest.fn(),
    updateVerification: jest.fn(),
    findManager: jest.fn(),
    listManagers: jest.fn(),
    changeManager: jest.fn(),
    follow: jest.fn(),
    unfollow: jest.fn(),
    isFollowing: jest.fn(),
    countFollowers: jest.fn(),
    listFollowedOrganizationIds: jest.fn(),
    createPost: jest.fn(),
    findPostById: jest.fn(),
    findPostByGlobalId: jest.fn(),
    updatePost: jest.fn(),
    deletePost: jest.fn(),
    listPosts: jest.fn(),
    listFeedPosts: jest.fn(),
    listFeedPostsForFollower: jest.fn(),
    createEvent: jest.fn(),
    findEventById: jest.fn(),
    updateEvent: jest.fn(),
    listEvents: jest.fn(),
    createLink: jest.fn(),
    deleteLink: jest.fn(),
    listLinks: jest.fn(),
    featureResource: jest.fn(),
    unfeatureResource: jest.fn(),
    listFeaturedResources: jest.fn(),
    upsertPendingReport: jest.fn(),
  };
}

function deps() {
  const academic = {
    resolveOrganizationScope: jest.fn(),
    resolveResourceContext: jest.fn(),
    getCatalogNode: jest.fn(),
  } as unknown as jest.Mocked<AcademicService>;
  const profiles = {
    getAttributionForUser: jest.fn(),
    getAttributionsForUsers: jest.fn(),
    resolveUserIdByProfileId: jest.fn(),
  } as unknown as jest.Mocked<ProfileService>;
  const resources = {
    get: jest.fn(),
  } as unknown as jest.Mocked<ResourceService>;

  return { academic, profiles, resources };
}

function defaults(
  organizationStore: jest.Mocked<OrganizationStore>,
  dependencies: ReturnType<typeof deps>,
) {
  dependencies.profiles.getAttributionForUser.mockResolvedValue({
    profileId,
    displayName: 'Owner',
    avatarUrl: null,
  });
  dependencies.profiles.getAttributionsForUsers.mockResolvedValue(
    new Map([
      ['owner-user', { profileId, displayName: 'Owner', avatarUrl: null }],
    ]),
  );
  dependencies.profiles.resolveUserIdByProfileId.mockResolvedValue(
    'target-user',
  );
  dependencies.academic.resolveOrganizationScope.mockResolvedValue({
    institutionId,
    campusId: null,
    academicUnitId: null,
    programId: null,
  });
  dependencies.academic.resolveResourceContext.mockImplementation((id) =>
    Promise.resolve({ subjectId: id, courseOfferingId: null }),
  );
  dependencies.academic.getCatalogNode.mockImplementation((id) =>
    Promise.resolve({
      node: {
        id,
        kind: id === institutionId ? 'institution' : 'subject',
        name: id === institutionId ? 'Universidad' : 'Materia',
        aliases: [],
        parentIds: [],
        status: 'active',
        redirectToId: undefined,
        provenance: {
          authorityTier: 'C',
          sourceKey: 'test',
          sourceUrl: 'https://example.test',
          externalId: undefined,
          sourceObservedName: undefined,
          sourceFingerprint: undefined,
          verifiedAt: undefined,
        },
        revision: 1,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      resolvedFromId: null,
    }),
  );
  organizationStore.findById.mockResolvedValue(organization());
  organizationStore.findManager.mockResolvedValue(manager());
  organizationStore.listManagers.mockResolvedValue([manager()]);
  organizationStore.countFollowers.mockResolvedValue(0);
  organizationStore.isFollowing.mockResolvedValue(false);
  organizationStore.listLinks.mockResolvedValue([]);
  organizationStore.listFeaturedResources.mockResolvedValue([]);
  organizationStore.listPosts.mockResolvedValue([]);
  organizationStore.listEvents.mockResolvedValue([]);
  organizationStore.findManyByIds.mockResolvedValue([organization()]);
}

function service(
  organizationStore: jest.Mocked<OrganizationStore>,
  dependencies: ReturnType<typeof deps>,
) {
  return new OrganizationService(
    organizationStore,
    dependencies.academic,
    dependencies.profiles,
    dependencies.resources,
  );
}

async function expectCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await promise;
    throw new Error(`Expected ${code}`);
  } catch (error) {
    if (!(
      error instanceof ConflictException ||
      error instanceof ForbiddenException ||
      error instanceof NotFoundException ||
      error instanceof UnprocessableEntityException
    )) {
      throw error;
    }
    expect(error.getResponse()).toMatchObject({ code });
  }
}

describe('OrganizationService', () => {
  it('requires a Profile before organization creation', async () => {
    const organizationStore = store();
    const dependencies = deps();
    defaults(organizationStore, dependencies);
    dependencies.profiles.getAttributionForUser.mockResolvedValue(null);

    await expectCode(
      service(organizationStore, dependencies).create('owner-user', {
        name: 'Centro',
        type: 'student_center',
        institutionId,
      }),
      'ORGANIZATION_PROFILE_REQUIRED',
    );
  });

  it('creates a claimed but unverified organization with an owner audit', async () => {
    const organizationStore = store();
    const dependencies = deps();
    defaults(organizationStore, dependencies);
    organizationStore.createWithOwner.mockImplementation((input) =>
      Promise.resolve({
        organization: {
          ...organization(),
          id: input.organization.id,
          name: input.organization.name,
          normalizedName: input.organization.normalizedName,
          createdAt: now,
          updatedAt: now,
        },
        owner: {
          organizationId: input.organization.id,
          userId: input.ownerUserId,
          role: 'owner',
          createdAt: now,
          updatedAt: now,
        },
      }),
    );

    const result = await service(organizationStore, dependencies).create(
      'owner-user',
      {
        name: ' Centro   de Estudiantes ',
        type: 'student_center',
        institutionId,
        websiteUrl: 'https://example.test',
      },
    );

    expect(result.organization.verificationState).toBe('unverified');
    expect(organizationStore.createWithOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 'owner-user',
        organization: expect.objectContaining({
          name: 'Centro de Estudiantes',
          normalizedName: 'centro de estudiantes',
          claimState: 'claimed',
          verificationState: 'unverified',
          institutionId,
        }),
        audit: expect.objectContaining({
          event: 'organization.created',
          nextRole: 'owner',
        }),
      }),
    );
  });

  it('rejects non-HTTPS organization URLs', async () => {
    const organizationStore = store();
    const dependencies = deps();
    defaults(organizationStore, dependencies);

    await expectCode(
      service(organizationStore, dependencies).create('owner-user', {
        name: 'Club',
        type: 'club',
        institutionId,
        websiteUrl: 'http://example.test',
      }),
      'ORGANIZATION_LINK_INVALID',
    );
  });

  it('canonicalizes search scope and returns cursored cards', async () => {
    const organizationStore = store();
    const dependencies = deps();
    defaults(organizationStore, dependencies);
    organizationStore.search.mockResolvedValue({
      items: [organization()],
      hasMore: true,
    });

    const result = await service(organizationStore, dependencies).search(
      'viewer',
      {
        q: ' Centro ',
        institutionId,
        limit: 10,
      },
    );

    expect(organizationStore.search).toHaveBeenCalledWith(
      expect.objectContaining({
        q: 'centro',
        institutionId,
        limit: 10,
      }),
    );
    expect(result.items[0]?.name).toBe('Centro de Estudiantes');
    expect(result.nextCursor).toEqual(expect.any(String));
  });

  it('rejects malformed organization cursors', async () => {
    const organizationStore = store();
    const dependencies = deps();
    defaults(organizationStore, dependencies);

    await expectCode(
      service(organizationStore, dependencies).search(undefined, {
        limit: 10,
        cursor: 'not-a-cursor',
      }),
      'ORGANIZATION_CURSOR_INVALID',
    );
  });

  it('allows owner/admin profile edits and enforces optimistic revision', async () => {
    const organizationStore = store();
    const dependencies = deps();
    defaults(organizationStore, dependencies);
    organizationStore.updateOwnedProfile.mockResolvedValue({
      ...organization(),
      name: 'Centro Actualizado',
      revision: 2,
    });

    const result = await service(organizationStore, dependencies).update(
      'owner-user',
      orgId,
      {
        expectedRevision: 1,
        name: ' Centro   Actualizado ',
      },
    );

    expect(result.organization.name).toBe('Centro Actualizado');
    expect(organizationStore.updateOwnedProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        patch: expect.objectContaining({
          name: 'Centro Actualizado',
          normalizedName: 'centro actualizado',
        }),
      }),
    );

    organizationStore.findById.mockResolvedValue(organization({ revision: 2 }));
    await expectCode(
      service(organizationStore, dependencies).update('owner-user', orgId, {
        expectedRevision: 1,
        about: 'Cambio',
      }),
      'ORGANIZATION_REVISION_CONFLICT',
    );
  });

  it('denies profile edits to editors', async () => {
    const organizationStore = store();
    const dependencies = deps();
    defaults(organizationStore, dependencies);
    organizationStore.findManager.mockResolvedValue(manager('editor'));

    await expectCode(
      service(organizationStore, dependencies).update('owner-user', orgId, {
        expectedRevision: 1,
        about: 'Cambio',
      }),
      'ORGANIZATION_MANAGEMENT_FORBIDDEN',
    );
  });

  it('separates verification state from management and supports idempotent no-op', async () => {
    const organizationStore = store();
    const dependencies = deps();
    defaults(organizationStore, dependencies);

    const unchanged = await service(
      organizationStore,
      dependencies,
    ).updateVerification('platform-user', orgId, {
      verificationState: 'unverified',
      reason: 'Evidence review',
      expectedRevision: 1,
    });
    expect(unchanged.changed).toBe(false);
    expect(organizationStore.updateVerification).not.toHaveBeenCalled();

    organizationStore.updateVerification.mockResolvedValue(
      organization({ verificationState: 'verified', revision: 2 }),
    );
    const changed = await service(
      organizationStore,
      dependencies,
    ).updateVerification('platform-user', orgId, {
      verificationState: 'verified',
      reason: ' Evidence   reviewed ',
      expectedRevision: 1,
    });
    expect(changed.changed).toBe(true);
    expect(organizationStore.updateVerification).toHaveBeenCalledWith(
      expect.objectContaining({
        audit: expect.objectContaining({
          event: 'organization.verification_updated',
          actorUserId: 'platform-user',
          reason: 'Evidence reviewed',
        }),
      }),
    );
  });

  it('prevents admins from granting or mutating owner roles', async () => {
    const organizationStore = store();
    const dependencies = deps();
    defaults(organizationStore, dependencies);
    organizationStore.findManager
      .mockResolvedValueOnce(manager('admin', 'admin-user'))
      .mockResolvedValueOnce(null);

    await expectCode(
      service(organizationStore, dependencies).changeManager(
        'admin-user',
        orgId,
        profileId,
        {
          role: 'owner',
          reason: 'No permitido',
          expectedManagementRevision: 1,
        },
      ),
      'ORGANIZATION_MANAGER_ROLE_FORBIDDEN',
    );
  });

  it('grants an editor atomically and returns refreshed management state', async () => {
    const organizationStore = store();
    const dependencies = deps();
    defaults(organizationStore, dependencies);
    organizationStore.findManager
      .mockResolvedValueOnce(manager('owner'))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(manager('owner'));
    organizationStore.listManagers
      .mockResolvedValueOnce([manager('owner')])
      .mockResolvedValueOnce([
        manager('owner'),
        manager('editor', 'target-user'),
      ]);
    organizationStore.changeManager.mockResolvedValue({
      status: 'ok',
      manager: manager('editor', 'target-user'),
      managementRevision: 2,
    });
    organizationStore.findById
      .mockResolvedValueOnce(organization())
      .mockResolvedValueOnce(organization({ managementRevision: 2 }));

    const result = await service(organizationStore, dependencies).changeManager(
      'owner-user',
      orgId,
      profileId,
      {
        role: 'editor',
        reason: 'Comunicación',
        expectedManagementRevision: 1,
      },
    );

    expect(result.managers).toHaveLength(2);
    expect(organizationStore.changeManager).toHaveBeenCalledWith(
      expect.objectContaining({
        targetUserId: 'target-user',
        expectedTargetRole: null,
        nextRole: 'editor',
        audit: expect.objectContaining({
          event: 'organization.manager_granted',
        }),
      }),
    );
  });

  it('maps final-owner and manager revision races to stable conflicts', async () => {
    const organizationStore = store();
    const dependencies = deps();
    defaults(organizationStore, dependencies);
    dependencies.profiles.resolveUserIdByProfileId.mockResolvedValue(
      'owner-user',
    );
    organizationStore.findManager
      .mockResolvedValueOnce(manager('owner'))
      .mockResolvedValueOnce(manager('owner'));
    organizationStore.changeManager.mockResolvedValue({
      status: 'final_owner',
    });

    await expectCode(
      service(organizationStore, dependencies).removeManager(
        'owner-user',
        orgId,
        profileId,
        {
          reason: 'Intento',
          expectedManagementRevision: 1,
        },
      ),
      'ORGANIZATION_FINAL_OWNER_REQUIRED',
    );

    organizationStore.findById.mockResolvedValue(
      organization({ managementRevision: 2 }),
    );
    await expectCode(
      service(organizationStore, dependencies).removeManager(
        'owner-user',
        orgId,
        profileId,
        {
          reason: 'Stale',
          expectedManagementRevision: 1,
        },
      ),
      'ORGANIZATION_MANAGEMENT_REVISION_CONFLICT',
    );
  });

  it('follows and unfollows idempotently without academic auto-follow', async () => {
    const organizationStore = store();
    const dependencies = deps();
    defaults(organizationStore, dependencies);
    organizationStore.follow.mockResolvedValue({
      follow: {
        organizationId: orgId,
        userId: 'viewer',
        createdAt: now,
        updatedAt: now,
      },
      created: false,
    });
    organizationStore.isFollowing.mockResolvedValue(true);

    await expect(
      service(organizationStore, dependencies).follow('viewer', orgId),
    ).resolves.toEqual({ following: true, changed: false });
    await expect(
      service(organizationStore, dependencies).unfollow('viewer', orgId),
    ).resolves.toEqual({ following: false, changed: true });
  });

  it('publishes organization posts with canonical subject and source attribution', async () => {
    const organizationStore = store();
    const dependencies = deps();
    defaults(organizationStore, dependencies);
    const row = post({ subjectId: '66666666-6666-4666-8666-666666666666' });
    organizationStore.createPost.mockResolvedValue(row);

    const result = await service(organizationStore, dependencies).createPost(
      'owner-user',
      orgId,
      {
        title: ' Novedad ',
        body: ' Información   útil ',
        subjectId: row.subjectId,
      },
    );

    expect(result.post.source).toEqual({
      kind: 'campus_organization',
      organization: {
        id: orgId,
        name: 'Centro de Estudiantes',
        verificationState: 'unverified',
      },
    });
    expect(result.post.academic?.subject.name).toBe('Materia');
  });

  it('rejects inverted event periods and creates valid moderatable events', async () => {
    const organizationStore = store();
    const dependencies = deps();
    defaults(organizationStore, dependencies);

    await expectCode(
      service(organizationStore, dependencies).createEvent(
        'owner-user',
        orgId,
        {
          title: 'Evento',
          startsAt: '2026-09-25T20:00:00.000Z',
          endsAt: '2026-09-25T19:00:00.000Z',
        },
      ),
      'ORGANIZATION_EVENT_PERIOD_INVALID',
    );

    organizationStore.createEvent.mockResolvedValue(event());
    await service(organizationStore, dependencies).createEvent(
      'owner-user',
      orgId,
      {
        title: 'Encuentro',
        startsAt: now.toISOString(),
      },
    );
    expect(organizationStore.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({ moderationState: 'available' }),
    );
  });

  it('features only currently public Resources and reauthorizes them on read', async () => {
    const organizationStore = store();
    const dependencies = deps();
    defaults(organizationStore, dependencies);
    dependencies.resources.get.mockRejectedValueOnce(
      new NotFoundException('hidden'),
    );

    await expectCode(
      service(organizationStore, dependencies).featureResource(
        'owner-user',
        orgId,
        '77777777-7777-4777-8777-777777777777',
      ),
      'ORGANIZATION_RESOURCE_NOT_PUBLIC',
    );

    organizationStore.listFeaturedResources.mockResolvedValue([
      {
        organizationId: orgId,
        resourceId: '77777777-7777-4777-8777-777777777777',
        createdByUserId: 'owner-user',
        createdAt: now,
        updatedAt: now,
      },
    ]);
    dependencies.resources.get.mockRejectedValue(
      new NotFoundException('now private'),
    );
    const result = await service(organizationStore, dependencies).get(
      orgId,
      'viewer',
    );
    expect(result.organization.featuredResources).toEqual([]);
  });

  it('creates idempotent moderation reports for visible posts and events', async () => {
    const organizationStore = store();
    const dependencies = deps();
    defaults(organizationStore, dependencies);
    organizationStore.findPostById.mockResolvedValue(post());
    organizationStore.findEventById.mockResolvedValue(event());
    organizationStore.upsertPendingReport.mockImplementation((input) =>
      Promise.resolve({
        ...input,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      }),
    );

    const postReport = await service(
      organizationStore,
      dependencies,
    ).reportPost('viewer', orgId, post().id, {
      reason: 'other',
      details: 'Revisar contenido',
    });
    const eventReport = await service(
      organizationStore,
      dependencies,
    ).reportEvent('viewer', orgId, event().id, {
      reason: 'misinformation',
    });

    expect(postReport.report.status).toBe('pending');
    expect(eventReport.report.targetType).toBe('organization_event');
  });

  it('returns followed organization feed candidates without manager attribution as source', async () => {
    const organizationStore = store();
    const dependencies = deps();
    defaults(organizationStore, dependencies);
    organizationStore.listFeedPostsForFollower.mockResolvedValue([post()]);
    organizationStore.findManyByIds.mockResolvedValue([
      organization({
        verificationState: 'verified',
        avatarUrl: 'https://example.test/avatar.png',
      }),
    ]);

    const result = await service(
      organizationStore,
      dependencies,
    ).getFeedCandidates('viewer', now, 20);

    expect(result).toEqual([
      expect.objectContaining({
        organizationId: orgId,
        organizationName: 'Centro de Estudiantes',
        verificationState: 'verified',
        createdByUserId: 'owner-user',
      }),
    ]);
  });

  it('hides moderated feed targets and unknown organizations', async () => {
    const organizationStore = store();
    const dependencies = deps();
    defaults(organizationStore, dependencies);
    organizationStore.findPostByGlobalId.mockResolvedValue(
      post({ moderationState: 'hidden' }),
    );

    await expectCode(
      service(organizationStore, dependencies).getFeedTarget(post().id),
      'ORGANIZATION_NOT_FOUND',
    );

    organizationStore.findById.mockResolvedValue(null);
    await expectCode(
      service(organizationStore, dependencies).get(orgId),
      'ORGANIZATION_NOT_FOUND',
    );
  });

  it('updates, lists and deletes posts with optimistic concurrency', async () => {
    const organizationStore = store();
    const dependencies = deps();
    defaults(organizationStore, dependencies);
    const current = post();
    const subjectId = '66666666-6666-4666-8666-666666666666';
    const updated = post({
      title: null,
      body: 'Contenido actualizado',
      subjectId,
      revision: 2,
      updatedAt: new Date(now.getTime() + 1_000),
    });

    organizationStore.findPostById.mockResolvedValue(current);
    organizationStore.updatePost.mockResolvedValue(updated);
    organizationStore.listPosts.mockResolvedValue([updated]);
    organizationStore.deletePost
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const result = await service(organizationStore, dependencies).updatePost(
      'owner-user',
      orgId,
      current.id,
      {
        expectedRevision: 1,
        title: null,
        body: ' Contenido   actualizado ',
        subjectId,
      },
    );

    expect(result.post.body).toBe('Contenido actualizado');
    expect(organizationStore.updatePost).toHaveBeenCalledWith(
      orgId,
      current.id,
      1,
      {
        title: null,
        body: 'Contenido actualizado',
        subjectId,
      },
    );

    const listed = await service(organizationStore, dependencies).listPosts(
      orgId,
      10,
      '2026-09-25T00:00:00.000Z',
    );
    expect(listed.items).toHaveLength(1);
    expect(organizationStore.listPosts).toHaveBeenCalledWith({
      organizationId: orgId,
      limit: 10,
      before: new Date('2026-09-25T00:00:00.000Z'),
    });

    await expect(
      service(organizationStore, dependencies).deletePost(
        'owner-user',
        orgId,
        current.id,
      ),
    ).resolves.toBeUndefined();

    await expectCode(
      service(organizationStore, dependencies).deletePost(
        'owner-user',
        orgId,
        current.id,
      ),
      'ORGANIZATION_NOT_FOUND',
    );

    await expectCode(
      service(organizationStore, dependencies).updatePost(
        'owner-user',
        orgId,
        current.id,
        { expectedRevision: 1 },
      ),
      'ORGANIZATION_POST_UPDATE_EMPTY',
    );

    organizationStore.updatePost.mockResolvedValue(null);
    await expectCode(
      service(organizationStore, dependencies).updatePost(
        'owner-user',
        orgId,
        current.id,
        {
          expectedRevision: 1,
          body: 'Cambio concurrente',
        },
      ),
      'ORGANIZATION_POST_REVISION_CONFLICT',
    );

    organizationStore.findPostById.mockResolvedValue(
      post({ moderationState: 'hidden' }),
    );
    await expectCode(
      service(organizationStore, dependencies).updatePost(
        'owner-user',
        orgId,
        current.id,
        {
          expectedRevision: 1,
          body: 'No visible',
        },
      ),
      'ORGANIZATION_NOT_FOUND',
    );
  });

  it('updates and lists events across nullable and conflict branches', async () => {
    const organizationStore = store();
    const dependencies = deps();
    defaults(organizationStore, dependencies);
    const current = event({
      endsAt: new Date(now.getTime() + 7_200_000),
      locationLabel: 'Aula 1',
      externalUrl: 'https://example.test/event',
    });
    const changedStart = new Date(now.getTime() + 3_600_000);
    const updated = event({
      title: 'Encuentro actualizado',
      description: null,
      startsAt: changedStart,
      endsAt: null,
      locationLabel: 'Aula 2',
      externalUrl: 'https://example.test/nuevo',
      state: 'cancelled',
      revision: 2,
      updatedAt: new Date(now.getTime() + 1_000),
    });

    organizationStore.findEventById.mockResolvedValue(current);
    organizationStore.updateEvent.mockResolvedValue(updated);
    organizationStore.listEvents.mockResolvedValue([updated]);

    const result = await service(organizationStore, dependencies).updateEvent(
      'owner-user',
      orgId,
      current.id,
      {
        expectedRevision: 1,
        title: ' Encuentro   actualizado ',
        description: null,
        startsAt: changedStart.toISOString(),
        endsAt: null,
        locationLabel: ' Aula 2 ',
        externalUrl: 'https://example.test/nuevo',
        state: 'cancelled',
      },
    );

    expect(result.event.state).toBe('cancelled');
    expect(organizationStore.updateEvent).toHaveBeenCalledWith(
      orgId,
      current.id,
      1,
      expect.objectContaining({
        title: 'Encuentro actualizado',
        description: null,
        startsAt: changedStart,
        endsAt: null,
        locationLabel: 'Aula 2',
        externalUrl: 'https://example.test/nuevo',
        state: 'cancelled',
      }),
    );

    const listed = await service(organizationStore, dependencies).listEvents(
      orgId,
      15,
      now.toISOString(),
    );
    expect(listed.items).toHaveLength(1);
    expect(organizationStore.listEvents).toHaveBeenCalledWith({
      organizationId: orgId,
      limit: 15,
      from: now,
    });

    await expectCode(
      service(organizationStore, dependencies).updateEvent(
        'owner-user',
        orgId,
        current.id,
        { expectedRevision: 1 },
      ),
      'ORGANIZATION_EVENT_UPDATE_EMPTY',
    );

    organizationStore.updateEvent.mockResolvedValue(null);
    await expectCode(
      service(organizationStore, dependencies).updateEvent(
        'owner-user',
        orgId,
        current.id,
        {
          expectedRevision: 1,
          title: 'Conflicto',
        },
      ),
      'ORGANIZATION_EVENT_REVISION_CONFLICT',
    );

    organizationStore.findEventById.mockResolvedValue(null);
    await expectCode(
      service(organizationStore, dependencies).updateEvent(
        'owner-user',
        orgId,
        current.id,
        {
          expectedRevision: 1,
          title: 'No existe',
        },
      ),
      'ORGANIZATION_NOT_FOUND',
    );
  });

  it('creates and deletes useful links and enforces the bounded link set', async () => {
    const organizationStore = store();
    const dependencies = deps();
    defaults(organizationStore, dependencies);
    const link = {
      id: '88888888-8888-4888-8888-888888888888',
      organizationId: orgId,
      createdByUserId: 'owner-user',
      label: 'Sitio oficial',
      url: 'https://example.test/',
      createdAt: now,
      updatedAt: now,
    };

    organizationStore.listLinks.mockResolvedValue([]);
    organizationStore.createLink.mockResolvedValue(link);
    organizationStore.deleteLink
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const result = await service(organizationStore, dependencies).createLink(
      'owner-user',
      orgId,
      {
        label: ' Sitio   oficial ',
        url: 'https://example.test',
      },
    );
    expect(result.link).toEqual({
      id: link.id,
      label: 'Sitio oficial',
      url: 'https://example.test/',
    });

    await expect(
      service(organizationStore, dependencies).deleteLink(
        'owner-user',
        orgId,
        link.id,
      ),
    ).resolves.toBeUndefined();

    await expectCode(
      service(organizationStore, dependencies).deleteLink(
        'owner-user',
        orgId,
        link.id,
      ),
      'ORGANIZATION_NOT_FOUND',
    );

    organizationStore.listLinks.mockResolvedValue(
      Array.from({ length: 20 }, (_, index) => ({
        ...link,
        id: `88888888-8888-4888-8${String(index).padStart(3, '0')}-888888888888`,
      })),
    );
    await expectCode(
      service(organizationStore, dependencies).createLink('owner-user', orgId, {
        label: 'Otro',
        url: 'https://example.test/otro',
      }),
      'ORGANIZATION_LINK_LIMIT',
    );
  });

  it('features and unfeatures public Resources while preserving limits and upstream errors', async () => {
    const organizationStore = store();
    const dependencies = deps();
    defaults(organizationStore, dependencies);
    const resourceId = '77777777-7777-4777-8777-777777777777';

    dependencies.resources.get.mockResolvedValue({ resource: {} } as never);
    organizationStore.listFeaturedResources.mockResolvedValue([]);
    organizationStore.featureResource.mockResolvedValue({
      organizationId: orgId,
      resourceId,
      createdByUserId: 'owner-user',
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      service(organizationStore, dependencies).featureResource(
        'owner-user',
        orgId,
        resourceId,
      ),
    ).resolves.toEqual({ featured: true });
    expect(organizationStore.featureResource).toHaveBeenCalledWith({
      organizationId: orgId,
      resourceId,
      createdByUserId: 'owner-user',
    });

    await expect(
      service(organizationStore, dependencies).unfeatureResource(
        'owner-user',
        orgId,
        resourceId,
      ),
    ).resolves.toBeUndefined();

    organizationStore.listFeaturedResources.mockResolvedValue(
      Array.from({ length: 20 }, (_, index) => ({
        organizationId: orgId,
        resourceId: `77777777-7777-4777-8${String(index).padStart(3, '0')}-777777777777`,
        createdByUserId: 'owner-user',
        createdAt: now,
        updatedAt: now,
      })),
    );
    await expectCode(
      service(organizationStore, dependencies).featureResource(
        'owner-user',
        orgId,
        '99999999-9999-4999-8999-999999999999',
      ),
      'ORGANIZATION_RESOURCE_LIMIT',
    );

    const upstream = new Error('resource backend unavailable');
    dependencies.resources.get.mockRejectedValue(upstream);
    await expect(
      service(organizationStore, dependencies).featureResource(
        'owner-user',
        orgId,
        resourceId,
      ),
    ).rejects.toBe(upstream);
  });

  it('covers manager no-op, capacity, missing-manager and revision conflicts', async () => {
    const organizationStore = store();
    const dependencies = deps();
    defaults(organizationStore, dependencies);

    organizationStore.findManager
      .mockResolvedValueOnce(manager('owner'))
      .mockResolvedValueOnce(manager('editor', 'target-user'))
      .mockResolvedValueOnce(manager('owner'));
    organizationStore.listManagers.mockResolvedValue([
      manager('owner'),
      manager('editor', 'target-user'),
    ]);

    const unchanged = await service(
      organizationStore,
      dependencies,
    ).changeManager('owner-user', orgId, profileId, {
      role: 'editor',
      reason: 'Sin cambio',
      expectedManagementRevision: 1,
    });
    expect(unchanged.managers).toHaveLength(2);
    expect(organizationStore.changeManager).not.toHaveBeenCalled();

    organizationStore.findById.mockResolvedValue(
      organization({ managementRevision: 2 }),
    );
    await expectCode(
      service(organizationStore, dependencies).changeManager(
        'owner-user',
        orgId,
        profileId,
        {
          role: 'admin',
          reason: 'Stale',
          expectedManagementRevision: 1,
        },
      ),
      'ORGANIZATION_MANAGEMENT_REVISION_CONFLICT',
    );

    organizationStore.findById.mockResolvedValue(organization());
    organizationStore.findManager
      .mockReset()
      .mockResolvedValueOnce(manager('owner'))
      .mockResolvedValueOnce(null);
    organizationStore.listManagers.mockResolvedValue(
      Array.from({ length: 20 }, (_, index) =>
        manager(index === 0 ? 'owner' : 'editor', `manager-${index}`),
      ),
    );
    await expectCode(
      service(organizationStore, dependencies).changeManager(
        'owner-user',
        orgId,
        profileId,
        {
          role: 'editor',
          reason: 'Capacidad',
          expectedManagementRevision: 1,
        },
      ),
      'ORGANIZATION_MANAGER_LIMIT',
    );

    organizationStore.findManager.mockReset().mockResolvedValue(null);
    await expectCode(
      service(organizationStore, dependencies).managementSnapshot(
        'stranger',
        orgId,
      ),
      'ORGANIZATION_MANAGEMENT_FORBIDDEN',
    );
  });

  it('covers search cursor decoding and canonical single-scope validation', async () => {
    const organizationStore = store();
    const dependencies = deps();
    defaults(organizationStore, dependencies);
    const row = organization({ normalizedName: 'centro' });
    organizationStore.search.mockResolvedValue({
      items: [row],
      hasMore: false,
    });

    dependencies.academic.getCatalogNode.mockResolvedValueOnce({
      node: {
        id: institutionId,
        kind: 'institution',
        name: 'Universidad',
        aliases: [],
        parentIds: [],
        status: 'active',
        redirectToId: undefined,
        provenance: {
          authorityTier: 'C',
          sourceKey: 'test',
          sourceUrl: 'https://example.test',
          externalId: undefined,
          sourceObservedName: undefined,
          sourceFingerprint: undefined,
          verifiedAt: undefined,
        },
        revision: 1,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      resolvedFromId: null,
    });

    const cursor = Buffer.from(
      JSON.stringify({ normalizedName: 'anterior', id: orgId }),
      'utf8',
    ).toString('base64url');
    await service(organizationStore, dependencies).search('viewer', {
      institutionId,
      limit: 10,
      cursor,
    });
    expect(organizationStore.search).toHaveBeenCalledWith(
      expect.objectContaining({
        institutionId,
        after: { normalizedName: 'anterior', id: orgId },
      }),
    );

    dependencies.academic.getCatalogNode.mockResolvedValueOnce({
      node: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        kind: 'program',
        name: 'Programa',
        aliases: [],
        parentIds: [],
        status: 'active',
        redirectToId: undefined,
        provenance: {
          authorityTier: 'C',
          sourceKey: 'test',
          sourceUrl: 'https://example.test',
          externalId: undefined,
          sourceObservedName: undefined,
          sourceFingerprint: undefined,
          verifiedAt: undefined,
        },
        revision: 1,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      resolvedFromId: null,
    });
    await service(organizationStore, dependencies).search(undefined, {
      programId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      limit: 10,
    });
    expect(organizationStore.search).toHaveBeenLastCalledWith(
      expect.objectContaining({
        programId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }),
    );

    dependencies.academic.getCatalogNode.mockResolvedValueOnce({
      node: {
        id: institutionId,
        kind: 'subject',
        name: 'No institución',
        aliases: [],
        parentIds: [],
        status: 'active',
        redirectToId: undefined,
        provenance: {
          authorityTier: 'C',
          sourceKey: 'test',
          sourceUrl: 'https://example.test',
          externalId: undefined,
          sourceObservedName: undefined,
          sourceFingerprint: undefined,
          verifiedAt: undefined,
        },
        revision: 1,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      resolvedFromId: null,
    });
    await expectCode(
      service(organizationStore, dependencies).search(undefined, {
        institutionId,
        limit: 10,
      }),
      'ORGANIZATION_SCOPE_INVALID',
    );

    await expectCode(
      service(organizationStore, dependencies).search(undefined, {
        limit: 10,
        cursor: Buffer.from(JSON.stringify({ nope: true })).toString(
          'base64url',
        ),
      }),
      'ORGANIZATION_CURSOR_INVALID',
    );
  });

  it('projects public managers/resources and resolves feed targets fail-closed', async () => {
    const organizationStore = store();
    const dependencies = deps();
    defaults(organizationStore, dependencies);
    const link = {
      id: '88888888-8888-4888-8888-888888888888',
      organizationId: orgId,
      createdByUserId: 'owner-user',
      label: 'Sitio',
      url: 'https://example.test/',
      createdAt: now,
      updatedAt: now,
    };
    const featured = {
      organizationId: orgId,
      resourceId: '77777777-7777-4777-8777-777777777777',
      createdByUserId: 'owner-user',
      createdAt: now,
      updatedAt: now,
    };

    organizationStore.listManagers.mockResolvedValue([
      manager('owner'),
      manager('editor', 'unknown-user'),
    ]);
    dependencies.profiles.getAttributionsForUsers.mockResolvedValue(new Map());
    organizationStore.listLinks.mockResolvedValue([link]);
    organizationStore.listFeaturedResources.mockResolvedValue([featured]);
    organizationStore.listPosts.mockResolvedValue([post()]);
    organizationStore.listEvents.mockResolvedValue([event()]);
    dependencies.resources.get.mockResolvedValue({
      resource: {
        id: featured.resourceId,
        title: 'Guía pública',
        academic: {
          subject: {
            id: '66666666-6666-4666-8666-666666666666',
            name: 'Materia',
          },
        },
      },
    } as never);

    const publicResult = await service(organizationStore, dependencies).get(
      orgId,
    );
    expect(publicResult.organization.managers[0]?.profile.displayName).toBe(
      'Usuario de Los Apuntes',
    );
    expect(publicResult.organization.links).toEqual([
      { id: link.id, label: link.label, url: link.url },
    ]);
    expect(publicResult.organization.featuredResources).toHaveLength(1);
    expect(publicResult.organization.posts).toHaveLength(1);
    expect(publicResult.organization.events).toHaveLength(1);
    expect(publicResult.organization.viewer).toBeUndefined();

    organizationStore.findPostByGlobalId.mockResolvedValue(post());
    organizationStore.findById.mockResolvedValue(organization());
    await expect(
      service(organizationStore, dependencies).getFeedTarget(post().id),
    ).resolves.toEqual({
      post: post(),
      organization: organization(),
    });

    organizationStore.findById.mockResolvedValue(
      organization({ status: 'archived' }),
    );
    await expectCode(
      service(organizationStore, dependencies).getFeedTarget(post().id),
      'ORGANIZATION_NOT_FOUND',
    );
  });

  it('maps academic scope failures and unexpected feature errors without hiding them', async () => {
    const organizationStore = store();
    const dependencies = deps();
    defaults(organizationStore, dependencies);

    dependencies.academic.resolveOrganizationScope.mockRejectedValueOnce(
      new NotFoundException('missing academic node'),
    );
    await expectCode(
      service(organizationStore, dependencies).create('owner-user', {
        name: 'Centro',
        type: 'student_center',
        institutionId,
      }),
      'ORGANIZATION_SCOPE_INVALID',
    );

    dependencies.academic.resolveOrganizationScope.mockRejectedValueOnce(
      new UnprocessableEntityException('bad scope'),
    );
    await expectCode(
      service(organizationStore, dependencies).create('owner-user', {
        name: 'Centro',
        type: 'student_center',
        institutionId,
      }),
      'ORGANIZATION_SCOPE_INVALID',
    );
  });
});
