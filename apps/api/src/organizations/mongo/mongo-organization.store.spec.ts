import {
  ORGANIZATION_FEATURED_RESOURCE_LIMIT,
  ORGANIZATION_LINK_LIMIT,
  ORGANIZATION_MANAGER_LIMIT,
} from '../domain/organization-limits';
import {
  OrganizationFeaturedResourceSchema,
  OrganizationLinkSchema,
} from './organization.mongo-schemas';
import { MongoOrganizationStore } from './mongo-organization.store';

const now = new Date('2026-09-30T12:00:00.000Z');
const organizationId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '22222222-2222-4222-8222-222222222222';

describe('Organization account-export indexes', () => {
  it('supports stable creator-scoped curation scans and preserves featured uniqueness', () => {
    expect(
      OrganizationLinkSchema.indexes().map(([keys]) => keys),
    ).toContainEqual({ createdByUserId: 1, id: 1 });

    const featuredIndexes = OrganizationFeaturedResourceSchema.indexes();
    expect(featuredIndexes.map(([keys]) => keys)).toContainEqual({
      createdByUserId: 1,
      organizationId: 1,
      resourceId: 1,
    });
    expect(
      featuredIndexes.some(
        ([keys, options]) =>
          JSON.stringify(keys) ===
            JSON.stringify({ organizationId: 1, resourceId: 1 }) &&
          options.unique === true,
      ),
    ).toBe(true);
  });
});

function query<T>(value: T) {
  return {
    session: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };
}

function listQuery<T>(value: T) {
  return {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };
}

function session() {
  return {
    withTransaction: jest.fn(async (callback: () => Promise<void>) =>
      callback(),
    ),
    endSession: jest.fn().mockResolvedValue(undefined),
  };
}

function models(input: {
  activeUser?: unknown;
  organization?: unknown;
  manager?: unknown;
  managerCount?: number;
  linkCount?: number;
  featuredCount?: number;
  existingFeatured?: unknown;
  managerRows?: unknown[];
  linkRows?: unknown[];
  featuredRows?: unknown[];
  followRows?: unknown[];
  reportRows?: unknown[];
  authoredPostRows?: unknown[];
  authoredEventRows?: unknown[];
  organizationRows?: unknown[];
}) {
  const activeSession = session();
  const connection = {
    startSession: jest.fn().mockResolvedValue(activeSession),
  };

  const users = {
    findOneAndUpdate: jest.fn(() =>
      query(
        input.activeUser === undefined
          ? { _id: actorUserId, account_status: 'active' }
          : input.activeUser,
      ),
    ),
  };
  const organizationSearchListQuery = listQuery(input.organizationRows ?? []);
  const organizations = {
    find: jest.fn(() => organizationSearchListQuery),
    findOne: jest.fn(() => query(input.organization ?? null)),
    findOneAndUpdate: jest.fn(
      (filter: unknown, update: unknown, options?: unknown) => {
        void filter;
        void update;
        void options;
        return query(input.organization ?? null);
      },
    ),
  };
  const managerListQuery = listQuery(input.managerRows ?? []);
  const linkListQuery = listQuery(input.linkRows ?? []);
  const featuredListQuery = listQuery(input.featuredRows ?? []);
  const followListQuery = listQuery(input.followRows ?? []);
  const reportListQuery = listQuery(input.reportRows ?? []);
  const authoredPostListQuery = listQuery(input.authoredPostRows ?? []);
  const authoredEventListQuery = listQuery(input.authoredEventRows ?? []);
  const managers = {
    find: jest.fn(() => managerListQuery),
    findOne: jest.fn(() => query(input.manager ?? null)),
    countDocuments: jest.fn((filter: unknown) => {
      void filter;
      return query(input.managerCount ?? 0);
    }),
    findOneAndUpdate: jest.fn(),
    deleteOne: jest.fn(),
    deleteMany: jest.fn(() => query({ deletedCount: 1 })),
  };
  const audits = {
    create: jest.fn(),
  };
  const follows = {
    find: jest.fn(() => followListQuery),
  };
  const reports = {
    find: jest.fn(() => reportListQuery),
  };
  const posts = {
    find: jest.fn(() => authoredPostListQuery),
    create: jest.fn(),
  };
  const events = {
    find: jest.fn(() => authoredEventListQuery),
  };
  const links = {
    find: jest.fn(() => linkListQuery),
    countDocuments: jest.fn((filter: unknown) => {
      void filter;
      return query(input.linkCount ?? 0);
    }),
    create: jest.fn(),
    deleteOne: jest.fn(),
  };
  const featuredResources = {
    find: jest.fn(() => featuredListQuery),
    findOne: jest.fn(() => query(input.existingFeatured ?? null)),
    countDocuments: jest.fn((filter: unknown) => {
      void filter;
      return query(input.featuredCount ?? 0);
    }),
    create: jest.fn(),
    deleteOne: jest.fn(),
  };

  const store = new MongoOrganizationStore(
    connection as never,
    users as never,
    organizations as never,
    managers as never,
    audits as never,
    follows as never,
    posts as never,
    events as never,
    links as never,
    featuredResources as never,
    reports as never,
  );

  return {
    store,
    connection,
    activeSession,
    users,
    organizations,
    organizationSearchListQuery,
    managers,
    audits,
    posts,
    events,
    links,
    featuredResources,
    follows,
    reports,
    managerListQuery,
    linkListQuery,
    featuredListQuery,
    followListQuery,
    reportListQuery,
    authoredPostListQuery,
    authoredEventListQuery,
  };
}

function createArchiveInput() {
  return {
    organizationId,
    authority: {
      actorUserId,
      expectedManagementRevision: 7,
      allowedRoles: ['owner'] as const,
    },
    mutation: {
      kind: 'organization.archive' as const,
      expectedRevision: 3,
    },
    audit: {
      id: '99999999-9999-4999-8999-999999999999',
      organizationId,
      event: 'organization.archived' as const,
      actorUserId,
      targetUserId: null,
      previousRole: null,
      nextRole: null,
      reason: 'Archive test',
      metadata: {
        previousStatus: 'active',
        nextStatus: 'archived',
        sharedContentPreserved: true,
      },
      createdAt: now,
    },
  };
}

function createPostInput() {
  return {
    organizationId,
    authority: {
      actorUserId,
      expectedManagementRevision: 7,
      allowedRoles: ['owner', 'admin', 'editor'] as const,
    },
    mutation: {
      kind: 'post.create' as const,
      record: {
        id: '33333333-3333-4333-8333-333333333333',
        organizationId,
        createdByUserId: actorUserId,
        title: 'Novedad',
        body: 'Contenido',
        subjectId: null,
        moderationState: 'available' as const,
        revision: 1,
        publishedAt: now,
      },
    },
    audit: {
      id: '44444444-4444-4444-8444-444444444444',
      organizationId,
      event: 'organization.post_created' as const,
      actorUserId,
      targetUserId: null,
      previousRole: null,
      nextRole: null,
      reason: 'Organization post created',
      metadata: {
        postId: '33333333-3333-4333-8333-333333333333',
      },
      createdAt: now,
    },
  };
}

function createLinkInput() {
  return {
    organizationId,
    authority: {
      actorUserId,
      expectedManagementRevision: 7,
      allowedRoles: ['owner', 'admin', 'editor'] as const,
    },
    mutation: {
      kind: 'link.create' as const,
      record: {
        id: '55555555-5555-4555-8555-555555555555',
        organizationId,
        createdByUserId: actorUserId,
        label: 'Sitio',
        url: 'https://example.test/',
      },
    },
    audit: {
      id: '66666666-6666-4666-8666-666666666666',
      organizationId,
      event: 'organization.link_created' as const,
      actorUserId,
      targetUserId: null,
      previousRole: null,
      nextRole: null,
      reason: 'Organization link created',
      metadata: { linkId: '55555555-5555-4555-8555-555555555555' },
      createdAt: now,
    },
  };
}

function featureResourceInput() {
  return {
    organizationId,
    authority: {
      actorUserId,
      expectedManagementRevision: 7,
      allowedRoles: ['owner', 'admin', 'editor'] as const,
    },
    mutation: {
      kind: 'resource.feature' as const,
      resourceId: '77777777-7777-4777-8777-777777777777',
      createdByUserId: actorUserId,
    },
    audit: {
      id: '88888888-8888-4888-8888-888888888888',
      organizationId,
      event: 'organization.resource_featured' as const,
      actorUserId,
      targetUserId: null,
      previousRole: null,
      nextRole: null,
      reason: 'Organization Resource featured',
      metadata: { resourceId: '77777777-7777-4777-8777-777777777777' },
      createdAt: now,
    },
  };
}

describe('MongoOrganizationStore verification-filtered directory', () => {
  it('keeps the active-only restriction while selecting verified organizations', async () => {
    const fixture = models({ organizationRows: [] });

    const result = await fixture.store.search({
      verificationState: 'verified',
      institutionId: organizationId,
      limit: 10,
    });

    expect(result).toEqual({ items: [], hasMore: false });
    expect(fixture.organizations.find).toHaveBeenCalledWith({
      $and: expect.arrayContaining([
        { status: 'active' },
        { verificationState: 'verified' },
        { institutionId: organizationId },
      ]),
    });
    expect(fixture.organizationSearchListQuery.limit).toHaveBeenCalledWith(11);
  });

  it('retains active-only filtering when no verification filter is supplied', async () => {
    const fixture = models({ organizationRows: [] });

    await fixture.store.search({ limit: 10 });

    expect(fixture.organizations.find).toHaveBeenCalledWith({
      $and: [{ status: 'active' }],
    });
  });
});

describe('MongoOrganizationStore bounded Organization collections', () => {
  it('limits complete managers, links and featured Resources to max+1 sentinels', async () => {
    const fixture = models({});

    await Promise.all([
      fixture.store.listManagers(organizationId),
      fixture.store.listLinks(organizationId),
      fixture.store.listFeaturedResources(organizationId),
    ]);

    expect(fixture.managerListQuery.limit.mock.calls).toEqual([
      [ORGANIZATION_MANAGER_LIMIT + 1],
    ]);
    expect(fixture.linkListQuery.limit.mock.calls).toEqual([
      [ORGANIZATION_LINK_LIMIT + 1],
    ]);
    expect(fixture.featuredListQuery.limit.mock.calls).toEqual([
      [ORGANIZATION_FEATURED_RESOURCE_LIMIT + 1],
    ]);
  });
});

describe('MongoOrganizationStore public content pagination', () => {
  function pageQuery<T>(rows: T[]) {
    const chain = {
      sort: jest.fn(),
      limit: jest.fn(),
      lean: jest.fn(),
      exec: jest.fn().mockResolvedValue(rows),
    };
    chain.sort.mockReturnValue(chain);
    chain.limit.mockReturnValue(chain);
    chain.lean.mockReturnValue(chain);
    return chain;
  }

  it('uses limit+1 and a stable publishedAt/id predicate for Posts', async () => {
    const publishedAt = new Date('2026-09-30T12:00:00.000Z');
    const rows = Array.from({ length: 3 }, (_, index) => ({
      id: `post-${index}`,
      publishedAt: new Date(publishedAt.getTime() - index * 1_000),
    }));
    const chain = pageQuery(rows);
    const posts = { find: jest.fn().mockReturnValue(chain) };
    const store = new MongoOrganizationStore(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      posts as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await store.listPosts({
      organizationId,
      limit: 2,
      after: { publishedAt, id: 'post-anchor' },
    });

    expect(posts.find).toHaveBeenCalledWith({
      $and: [
        {
          organizationId,
          moderationState: 'available',
        },
        {
          $or: [
            { publishedAt: { $lt: publishedAt } },
            {
              publishedAt,
              id: { $gt: 'post-anchor' },
            },
          ],
        },
      ],
    });
    expect(chain.sort).toHaveBeenCalledWith({ publishedAt: -1, id: 1 });
    expect(chain.limit).toHaveBeenCalledWith(3);
    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(true);
  });

  it('uses limit+1 and a stable startsAt/id predicate for Events', async () => {
    const startsAt = new Date('2026-10-01T12:00:00.000Z');
    const rows = Array.from({ length: 3 }, (_, index) => ({
      id: `event-${index}`,
      startsAt: new Date(startsAt.getTime() + index * 1_000),
    }));
    const chain = pageQuery(rows);
    const events = { find: jest.fn().mockReturnValue(chain) };
    const store = new MongoOrganizationStore(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      events as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await store.listEvents({
      organizationId,
      limit: 2,
      after: { startsAt, id: 'event-anchor' },
    });

    expect(events.find).toHaveBeenCalledWith({
      $and: [
        {
          organizationId,
          moderationState: 'available',
        },
        {
          $or: [
            { startsAt: { $gt: startsAt } },
            {
              startsAt,
              id: { $gt: 'event-anchor' },
            },
          ],
        },
      ],
    });
    expect(chain.sort).toHaveBeenCalledWith({ startsAt: 1, id: 1 });
    expect(chain.limit).toHaveBeenCalledWith(3);
    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(true);
  });
});

describe('MongoOrganizationStore followed feed isolation', () => {
  it('joins the exact followed organization and requires it to stay active', async () => {
    const aggregate = jest.fn((pipeline: unknown[]) => {
      void pipeline;
      return {
        exec: jest.fn().mockResolvedValue([]),
      };
    });
    const posts = { aggregate };
    const store = new MongoOrganizationStore(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      posts as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await store.listFeedPostsForFollower({
      userId: actorUserId,
      anchorAt: now,
      limit: 25,
    });

    const pipeline = aggregate.mock.calls[0]?.[0];
    expect(JSON.stringify(pipeline)).not.toContain(
      '["$organizationId","$organizationId"]',
    );
    expect(JSON.stringify(pipeline)).toContain('"$organizationId"');

    expect(pipeline).toEqual(
      expect.arrayContaining([
        {
          $lookup: {
            from: 'organizations',
            let: { organizationId: '$organizationId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$id', '$$organizationId'] },
                      { $eq: ['$status', 'active'] },
                    ],
                  },
                },
              },
              { $limit: 1 },
            ],
            as: '__activeOrganization',
          },
        },
        { $match: { '__activeOrganization.0': { $exists: true } } },
        {
          $lookup: {
            from: 'organization_follows',
            let: { organizationId: '$organizationId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$organizationId', '$$organizationId'] },
                      { $eq: ['$userId', actorUserId] },
                    ],
                  },
                },
              },
              { $limit: 1 },
            ],
            as: '__viewerFollow',
          },
        },
      ]),
    );
  });
});

describe('MongoOrganizationStore commit authority', () => {
  it('archives and revokes all manager authority in one transaction', async () => {
    const archived = {
      id: organizationId,
      status: 'archived',
      revision: 4,
      managementRevision: 8,
    };
    const fixture = models({
      organization: {
        id: organizationId,
        status: 'active',
        revision: 3,
        managementRevision: 7,
      },
      manager: {
        organizationId,
        userId: actorUserId,
        role: 'owner',
      },
    });
    fixture.organizations.findOneAndUpdate.mockReturnValueOnce(query(archived));
    fixture.audits.create.mockResolvedValue([createArchiveInput().audit]);

    await expect(
      fixture.store.commitAuthorizedMutation(createArchiveInput()),
    ).resolves.toEqual({
      status: 'ok',
      kind: 'organization.archive',
      value: archived,
    });

    expect(fixture.organizations.findOneAndUpdate).toHaveBeenCalledWith(
      {
        id: organizationId,
        status: 'active',
        revision: 3,
        managementRevision: 7,
      },
      {
        $set: { status: 'archived' },
        $inc: { revision: 1, managementRevision: 1 },
      },
      { new: true, session: fixture.activeSession },
    );
    expect(fixture.managers.deleteMany).toHaveBeenCalledWith({
      organizationId,
    });
    expect(fixture.audits.create).toHaveBeenCalledWith(
      [createArchiveInput().audit],
      { session: fixture.activeSession },
    );
    expect(fixture.posts.create).not.toHaveBeenCalled();
    expect(fixture.links.deleteOne).not.toHaveBeenCalled();
    expect(fixture.featuredResources.deleteOne).not.toHaveBeenCalled();
    expect(fixture.activeSession.withTransaction).toHaveBeenCalledTimes(1);
  });

  it('does not write after management revision changed before commit', async () => {
    const fixture = models({ organization: null });

    await expect(
      fixture.store.commitAuthorizedMutation(createPostInput()),
    ).resolves.toEqual({ status: 'authority_stale' });

    expect(fixture.organizations.findOne).toHaveBeenCalledWith({
      id: organizationId,
      status: 'active',
      managementRevision: 7,
    });
    expect(fixture.managers.findOne).not.toHaveBeenCalled();
    expect(fixture.posts.create).not.toHaveBeenCalled();
    expect(fixture.audits.create).not.toHaveBeenCalled();
    expect(fixture.activeSession.endSession).toHaveBeenCalledTimes(1);
  });

  it('does not write when actor role was revoked before commit', async () => {
    const fixture = models({
      organization: {
        id: organizationId,
        status: 'active',
        managementRevision: 7,
      },
      manager: null,
    });

    await expect(
      fixture.store.commitAuthorizedMutation(createPostInput()),
    ).resolves.toEqual({ status: 'authority_stale' });

    expect(fixture.managers.findOne).toHaveBeenCalledWith({
      organizationId,
      userId: actorUserId,
      role: { $in: ['owner', 'admin', 'editor'] },
    });
    expect(fixture.posts.create).not.toHaveBeenCalled();
    expect(fixture.audits.create).not.toHaveBeenCalled();
  });

  it('rejects link creation at the transactional capacity limit before write/audit', async () => {
    const fixture = models({
      organization: {
        id: organizationId,
        status: 'active',
        managementRevision: 7,
      },
      manager: {
        organizationId,
        userId: actorUserId,
        role: 'editor',
      },
      linkCount: 20,
    });

    await expect(
      fixture.store.commitAuthorizedMutation(createLinkInput()),
    ).resolves.toEqual({
      status: 'collection_limit',
      collection: 'links',
    });

    expect(fixture.organizations.findOneAndUpdate.mock.calls[0]?.[0]).toEqual({
      id: organizationId,
      status: 'active',
      managementRevision: 7,
    });
    expect(fixture.organizations.findOneAndUpdate.mock.calls[0]?.[1]).toEqual({
      $inc: { capacityRevision: 1 },
    });
    expect(fixture.links.countDocuments.mock.calls[0]?.[0]).toEqual({
      organizationId,
    });
    expect(
      fixture.organizations.findOneAndUpdate.mock.invocationCallOrder[0],
    ).toBeLessThan(fixture.links.countDocuments.mock.invocationCallOrder[0]);
    expect(fixture.links.create.mock.calls).toHaveLength(0);
    expect(fixture.audits.create.mock.calls).toHaveLength(0);
  });

  it('allows the twentieth link only after taking the capacity serialization lock', async () => {
    const fixture = models({
      organization: {
        id: organizationId,
        status: 'active',
        managementRevision: 7,
      },
      manager: {
        organizationId,
        userId: actorUserId,
        role: 'editor',
      },
      linkCount: 19,
    });
    const input = createLinkInput();
    fixture.links.create.mockResolvedValue([
      {
        ...input.mutation.record,
        createdAt: now,
        updatedAt: now,
        toObject: () => ({
          ...input.mutation.record,
          createdAt: now,
          updatedAt: now,
        }),
      },
    ]);
    fixture.audits.create.mockResolvedValue([input.audit]);

    await expect(
      fixture.store.commitAuthorizedMutation(input),
    ).resolves.toMatchObject({
      status: 'ok',
      kind: 'link.create',
      value: { id: input.mutation.record.id },
    });

    expect(fixture.links.create.mock.calls).toHaveLength(1);
    expect(fixture.audits.create.mock.calls).toHaveLength(1);
  });

  it('keeps an existing featured Resource idempotent without consuming capacity', async () => {
    const existing = {
      organizationId,
      resourceId: '77777777-7777-4777-8777-777777777777',
      createdByUserId: actorUserId,
      createdAt: now,
      updatedAt: now,
    };
    const fixture = models({
      organization: {
        id: organizationId,
        status: 'active',
        managementRevision: 7,
      },
      manager: {
        organizationId,
        userId: actorUserId,
        role: 'editor',
      },
      featuredCount: 20,
      existingFeatured: existing,
    });

    await expect(
      fixture.store.commitAuthorizedMutation(featureResourceInput()),
    ).resolves.toEqual({
      status: 'ok',
      kind: 'resource.feature',
      value: existing,
    });

    expect(fixture.organizations.findOneAndUpdate.mock.calls).toHaveLength(0);
    expect(fixture.featuredResources.countDocuments.mock.calls).toHaveLength(0);
    expect(fixture.featuredResources.create.mock.calls).toHaveLength(0);
  });

  it('rejects a new featured Resource at the transactional capacity limit', async () => {
    const fixture = models({
      organization: {
        id: organizationId,
        status: 'active',
        managementRevision: 7,
      },
      manager: {
        organizationId,
        userId: actorUserId,
        role: 'editor',
      },
      featuredCount: 20,
    });

    await expect(
      fixture.store.commitAuthorizedMutation(featureResourceInput()),
    ).resolves.toEqual({
      status: 'collection_limit',
      collection: 'featured_resources',
    });

    expect(fixture.featuredResources.create.mock.calls).toHaveLength(0);
    expect(fixture.audits.create.mock.calls).toHaveLength(0);
  });

  it('rejects a manager grant when the target account is no longer active', async () => {
    const fixture = models({
      activeUser: null,
      organization: {
        id: organizationId,
        status: 'active',
        managementRevision: 7,
      },
      manager: null,
      managerCount: 0,
    });

    await expect(
      fixture.store.changeManager({
        organizationId,
        actorUserId,
        targetUserId: '99999999-9999-4999-8999-999999999999',
        expectedManagementRevision: 7,
        expectedTargetRole: null,
        nextRole: 'editor',
        audit: {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          organizationId,
          event: 'organization.manager_granted',
          actorUserId,
          targetUserId: '99999999-9999-4999-8999-999999999999',
          previousRole: null,
          nextRole: 'editor',
          reason: 'Inactive target test',
          metadata: {},
          createdAt: now,
        },
      }),
    ).resolves.toEqual({ status: 'target_inactive' });

    expect(fixture.users.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: '99999999-9999-4999-8999-999999999999',
        $or: [
          { account_status: 'active' },
          { account_status: { $exists: false } },
        ],
      },
      { $inc: { management_authority_revision: 1 } },
      { new: false, session: fixture.activeSession },
    );
    expect(fixture.managers.findOneAndUpdate).not.toHaveBeenCalled();
    expect(fixture.audits.create).not.toHaveBeenCalled();
  });

  it('rejects a new manager at the cap inside the management transaction', async () => {
    const fixture = models({
      organization: {
        id: organizationId,
        status: 'active',
        managementRevision: 7,
      },
      manager: null,
      managerCount: 20,
    });

    await expect(
      fixture.store.changeManager({
        organizationId,
        actorUserId,
        targetUserId: '99999999-9999-4999-8999-999999999999',
        expectedManagementRevision: 7,
        expectedTargetRole: null,
        nextRole: 'editor',
        audit: {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          organizationId,
          event: 'organization.manager_granted',
          actorUserId,
          targetUserId: '99999999-9999-4999-8999-999999999999',
          previousRole: null,
          nextRole: 'editor',
          reason: 'Capacity test',
          metadata: {},
          createdAt: now,
        },
      }),
    ).resolves.toEqual({ status: 'manager_limit' });

    expect(fixture.managers.countDocuments.mock.calls[0]?.[0]).toEqual({
      organizationId,
    });
    expect(fixture.managers.findOneAndUpdate.mock.calls).toHaveLength(0);
    expect(fixture.organizations.findOneAndUpdate.mock.calls).toHaveLength(0);
    expect(fixture.audits.create.mock.calls).toHaveLength(0);
  });

  it('takes the Organization write fence before content and audit commit', async () => {
    const fixture = models({
      organization: {
        id: organizationId,
        status: 'active',
        managementRevision: 7,
      },
      manager: {
        organizationId,
        userId: actorUserId,
        role: 'editor',
      },
    });
    const input = createPostInput();
    fixture.posts.create.mockResolvedValue([
      {
        ...input.mutation.record,
        createdAt: now,
        updatedAt: now,
        toObject: () => ({
          ...input.mutation.record,
          createdAt: now,
          updatedAt: now,
        }),
      },
    ]);
    fixture.audits.create.mockResolvedValue([input.audit]);

    const result = await fixture.store.commitAuthorizedMutation(input);

    expect(result).toMatchObject({
      status: 'ok',
      kind: 'post.create',
      value: {
        id: input.mutation.record.id,
        organizationId,
        body: 'Contenido',
      },
    });
    expect(fixture.organizations.findOneAndUpdate).toHaveBeenCalledWith(
      {
        id: organizationId,
        status: 'active',
        managementRevision: 7,
      },
      { $inc: { capacityRevision: 1 } },
      { new: true, session: fixture.activeSession },
    );
    expect(
      fixture.organizations.findOneAndUpdate.mock.invocationCallOrder[0],
    ).toBeLessThan(fixture.posts.create.mock.invocationCallOrder[0]);
    expect(fixture.posts.create).toHaveBeenCalledWith([input.mutation.record], {
      session: fixture.activeSession,
    });
    expect(fixture.audits.create).toHaveBeenCalledWith([input.audit], {
      session: fixture.activeSession,
    });
    expect(fixture.activeSession.withTransaction).toHaveBeenCalledTimes(1);
  });
});

describe('MongoOrganizationStore account export following', () => {
  it('uses the owner filter, explicit fields, stable cursor and limit+1 read', async () => {
    const first = {
      organizationId,
      createdAt: now,
    };
    const fixture = models({ followRows: [first, { ...first }] });
    const after = {
      createdAt: now,
      organizationId: '00000000-0000-4000-8000-000000000000',
    };

    const result = await fixture.store.listForAccountExportFollowing({
      userId: actorUserId,
      limit: 1,
      after,
    });

    expect(fixture.follows.find).toHaveBeenCalledWith({
      $and: [
        { userId: actorUserId },
        {
          $or: [
            { createdAt: { $lt: now } },
            {
              createdAt: now,
              organizationId: { $gt: after.organizationId },
            },
          ],
        },
      ],
    });
    expect(fixture.followListQuery.select).toHaveBeenCalledWith({
      _id: 0,
      organizationId: 1,
      createdAt: 1,
    });
    expect(fixture.followListQuery.sort).toHaveBeenCalledWith({
      createdAt: -1,
      organizationId: 1,
    });
    expect(fixture.followListQuery.limit).toHaveBeenCalledWith(2);
    expect(result).toEqual({ items: [first], hasMore: true });
    expect(fixture.organizations.findOne).not.toHaveBeenCalled();
  });
});

describe('MongoOrganizationStore account export management', () => {
  it('reads only the owner manager rows with an explicit projection and stable limit+1 page', async () => {
    const first = {
      organizationId,
      role: 'admin',
      createdAt: now,
      updatedAt: now,
    };
    const fixture = models({ managerRows: [first, { ...first }] });

    const firstPage = await fixture.store.listForAccountExportManagement({
      userId: actorUserId,
      limit: 1,
    });
    const result = await fixture.store.listForAccountExportManagement({
      userId: actorUserId,
      limit: 1,
      after: { organizationId: '00000000-0000-4000-8000-000000000000' },
    });

    expect(fixture.managers.find).toHaveBeenNthCalledWith(1, {
      $and: [{ userId: actorUserId }],
    });
    expect(fixture.managers.find).toHaveBeenNthCalledWith(2, {
      $and: [
        { userId: actorUserId },
        { organizationId: { $gt: '00000000-0000-4000-8000-000000000000' } },
      ],
    });
    expect(fixture.managerListQuery.select).toHaveBeenCalledWith({
      _id: 0,
      organizationId: 1,
      role: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    expect(fixture.managerListQuery.sort).toHaveBeenCalledWith({
      organizationId: 1,
    });
    expect(fixture.managerListQuery.limit).toHaveBeenNthCalledWith(1, 2);
    expect(fixture.managerListQuery.limit).toHaveBeenNthCalledWith(2, 2);
    expect(firstPage).toEqual({ items: [first], hasMore: true });
    expect(result).toEqual({ items: [first], hasMore: true });
    expect(fixture.organizations.findOne).not.toHaveBeenCalled();
  });
});

describe('MongoOrganizationStore account export submitted reports', () => {
  it('reads only reports sent by the owner with an allowlist and stable id page', async () => {
    const first = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      targetType: 'organization_post',
      targetId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      reason: 'other',
      details: 'Owner-authored explanation',
      createdAt: now,
      status: 'resolved',
      reviewedByUserId: 'reviewer-user',
      reviewReason: 'Private moderation note',
      reviewAction: 'hide',
    };
    const fixture = models({ reportRows: [first, { ...first }] });
    const afterId = '00000000-0000-4000-8000-000000000000';

    const result = await fixture.store.listForAccountExportSubmittedReports({
      userId: actorUserId,
      limit: 1,
      after: { id: afterId },
    });

    expect(fixture.reports.find).toHaveBeenCalledWith({
      $and: [{ reporterUserId: actorUserId }, { id: { $gt: afterId } }],
    });
    expect(fixture.reportListQuery.select).toHaveBeenCalledWith({
      _id: 0,
      id: 1,
      targetType: 1,
      targetId: 1,
      reason: 1,
      details: 1,
      createdAt: 1,
    });
    expect(fixture.reportListQuery.sort).toHaveBeenCalledWith({ id: 1 });
    expect(fixture.reportListQuery.limit).toHaveBeenCalledWith(2);
    expect(result).toEqual({ items: [first], hasMore: true });
    expect(fixture.organizations.findOne).not.toHaveBeenCalled();
    expect(fixture.posts.find).not.toHaveBeenCalled();
    expect(fixture.events.find).not.toHaveBeenCalled();
  });
});

describe('MongoOrganizationStore account export authored content', () => {
  it('reads only the owner Posts with an explicit projection and stable id page', async () => {
    const first = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      organizationId,
      title: 'Owner Post',
      body: 'Owner body',
      subjectId: 'subject-id',
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    const fixture = models({ authoredPostRows: [first, { ...first }] });

    const result = await fixture.store.listAuthoredPostsForAccountExport({
      userId: actorUserId,
      limit: 1,
      after: { id: '00000000-0000-4000-8000-000000000000' },
    });

    expect(fixture.posts.find).toHaveBeenCalledWith({
      $and: [
        { createdByUserId: actorUserId },
        { id: { $gt: '00000000-0000-4000-8000-000000000000' } },
      ],
    });
    expect(fixture.authoredPostListQuery.select).toHaveBeenCalledWith({
      _id: 0,
      id: 1,
      organizationId: 1,
      title: 1,
      body: 1,
      subjectId: 1,
      publishedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    expect(fixture.authoredPostListQuery.sort).toHaveBeenCalledWith({ id: 1 });
    expect(fixture.authoredPostListQuery.limit).toHaveBeenCalledWith(2);
    expect(result).toEqual({ items: [first], hasMore: true });
  });

  it('reads only the owner Events and omits moderation fields from the allowlist', async () => {
    const first = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      organizationId,
      title: 'Owner Event',
      description: null,
      startsAt: now,
      endsAt: null,
      locationLabel: null,
      externalUrl: 'https://events.example.test/ticket',
      state: 'cancelled',
      createdAt: now,
      updatedAt: now,
    };
    const fixture = models({ authoredEventRows: [first] });

    const result = await fixture.store.listAuthoredEventsForAccountExport({
      userId: actorUserId,
      limit: 100,
    });

    expect(fixture.events.find).toHaveBeenCalledWith({
      $and: [{ createdByUserId: actorUserId }],
    });
    expect(fixture.authoredEventListQuery.select).toHaveBeenCalledWith({
      _id: 0,
      id: 1,
      organizationId: 1,
      title: 1,
      description: 1,
      startsAt: 1,
      endsAt: 1,
      locationLabel: 1,
      externalUrl: 1,
      state: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    expect(fixture.authoredEventListQuery.sort).toHaveBeenCalledWith({ id: 1 });
    expect(fixture.authoredEventListQuery.limit).toHaveBeenCalledWith(101);
    expect(result).toEqual({ items: [first], hasMore: false });
  });

  it('reads only the owner-authored links with an explicit projection and stable id page', async () => {
    const first = {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      organizationId,
      label: 'Community site',
      url: 'https://example.test',
      createdAt: now,
      updatedAt: now,
      createdByUserId: actorUserId,
    };
    const fixture = models({ linkRows: [first, { ...first }] });

    const result = await fixture.store.listAuthoredLinksForAccountExport({
      userId: actorUserId,
      limit: 1,
      after: { id: '00000000-0000-4000-8000-000000000000' },
    });

    expect(fixture.links.find).toHaveBeenCalledWith({
      $and: [
        { createdByUserId: actorUserId },
        { id: { $gt: '00000000-0000-4000-8000-000000000000' } },
      ],
    });
    expect(fixture.linkListQuery.select).toHaveBeenCalledWith({
      _id: 0,
      id: 1,
      organizationId: 1,
      label: 1,
      url: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    expect(fixture.linkListQuery.sort).toHaveBeenCalledWith({ id: 1 });
    expect(fixture.linkListQuery.limit).toHaveBeenCalledWith(2);
    expect(result).toEqual({ items: [first], hasMore: true });
    expect(fixture.organizations.findOne).not.toHaveBeenCalled();
  });

  it('reads only the creator featured-resource relations with an opaque tuple page', async () => {
    const first = {
      organizationId,
      resourceId: 'resource-2',
      createdAt: now,
      updatedAt: now,
      createdByUserId: actorUserId,
    };
    const fixture = models({ featuredRows: [first, { ...first }] });

    const result = await fixture.store.listFeaturedResourcesForAccountExport({
      userId: actorUserId,
      limit: 1,
      after: { organizationId, resourceId: 'resource-1' },
    });

    expect(fixture.featuredResources.find).toHaveBeenCalledWith({
      $and: [
        { createdByUserId: actorUserId },
        {
          $or: [
            { organizationId: { $gt: organizationId } },
            { organizationId, resourceId: { $gt: 'resource-1' } },
          ],
        },
      ],
    });
    expect(fixture.featuredListQuery.select).toHaveBeenCalledWith({
      _id: 0,
      organizationId: 1,
      resourceId: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    expect(fixture.featuredListQuery.sort).toHaveBeenCalledWith({
      organizationId: 1,
      resourceId: 1,
    });
    expect(fixture.featuredListQuery.limit).toHaveBeenCalledWith(2);
    expect(result).toEqual({ items: [first], hasMore: true });
    expect(fixture.organizations.findOne).not.toHaveBeenCalled();
    expect(fixture.posts.find).not.toHaveBeenCalled();
  });
});
