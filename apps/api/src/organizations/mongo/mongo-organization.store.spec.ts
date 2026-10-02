import {
  ORGANIZATION_FEATURED_RESOURCE_LIMIT,
  ORGANIZATION_LINK_LIMIT,
  ORGANIZATION_MANAGER_LIMIT,
} from '../domain/organization-limits';
import { MongoOrganizationStore } from './mongo-organization.store';

const now = new Date('2026-09-30T12:00:00.000Z');
const organizationId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '22222222-2222-4222-8222-222222222222';

function query<T>(value: T) {
  return {
    session: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };
}

function listQuery<T>(value: T) {
  return {
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
  const organizations = {
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
  const managers = {
    find: jest.fn(() => managerListQuery),
    findOne: jest.fn(() => query(input.manager ?? null)),
    countDocuments: jest.fn((filter: unknown) => {
      void filter;
      return query(input.managerCount ?? 0);
    }),
    findOneAndUpdate: jest.fn(),
    deleteOne: jest.fn(),
  };
  const audits = {
    create: jest.fn(),
  };
  const posts = {
    create: jest.fn(),
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
    {} as never,
    posts as never,
    {} as never,
    links as never,
    featuredResources as never,
    {} as never,
  );

  return {
    store,
    connection,
    activeSession,
    users,
    organizations,
    managers,
    audits,
    posts,
    links,
    featuredResources,
    managerListQuery,
    linkListQuery,
    featuredListQuery,
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

describe('MongoOrganizationStore commit authority', () => {
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

  it('writes content and audit inside the same authorized transaction', async () => {
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
    expect(fixture.posts.create).toHaveBeenCalledWith([input.mutation.record], {
      session: fixture.activeSession,
    });
    expect(fixture.audits.create).toHaveBeenCalledWith([input.audit], {
      session: fixture.activeSession,
    });
    expect(fixture.activeSession.withTransaction).toHaveBeenCalledTimes(1);
  });
});
