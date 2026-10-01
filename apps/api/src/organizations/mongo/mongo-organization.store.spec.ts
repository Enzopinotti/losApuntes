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

function session() {
  return {
    withTransaction: jest.fn(async (callback: () => Promise<void>) =>
      callback(),
    ),
    endSession: jest.fn().mockResolvedValue(undefined),
  };
}

function models(input: {
  organization?: unknown;
  manager?: unknown;
  managerCount?: number;
  linkCount?: number;
  featuredCount?: number;
  existingFeatured?: unknown;
}) {
  const activeSession = session();
  const connection = {
    startSession: jest.fn().mockResolvedValue(activeSession),
  };

  const organizations = {
    findOne: jest.fn(() => query(input.organization ?? null)),
    findOneAndUpdate: jest.fn(() => query(input.organization ?? null)),
  };
  const managers = {
    findOne: jest.fn(() => query(input.manager ?? null)),
    countDocuments: jest.fn(() => query(input.managerCount ?? 0)),
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
    countDocuments: jest.fn(() => query(input.linkCount ?? 0)),
    create: jest.fn(),
    deleteOne: jest.fn(),
  };
  const featuredResources = {
    findOne: jest.fn(() => query(input.existingFeatured ?? null)),
    countDocuments: jest.fn(() => query(input.featuredCount ?? 0)),
    create: jest.fn(),
    deleteOne: jest.fn(),
  };

  const store = new MongoOrganizationStore(
    connection as never,
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
    organizations,
    managers,
    audits,
    posts,
    links,
    featuredResources,
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
