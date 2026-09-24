import {
  ConflictException,
  HttpException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { AcademicService } from '../../academic/domain/academic.service';
import type { OrganizationService } from '../../organizations/domain/organization.service';
import type { ProfileService } from '../../profile/domain/profile.service';
import type { QaService } from '../../qa/domain/qa.service';
import type { QuestionRecord } from '../../qa/domain/qa.types';
import type { ResourceService } from '../../resources/domain/resource.service';
import type { ResourceRecord } from '../../resources/domain/resource.types';
import type { SocialService } from '../../social/domain/social.service';
import type { FeedStore } from './feed.store';
import { FeedService } from './feed.service';
import type { FeedPreferencesRecord } from './feed.types';

const now = new Date('2026-09-23T17:00:00.000Z');
const subjectId = '11111111-1111-4111-8111-111111111111';
const otherSubjectId = '22222222-2222-4222-8222-222222222222';
const profileId = '33333333-3333-4333-8333-333333333333';

function preferences(
  overrides: Partial<FeedPreferencesRecord> = {},
): FeedPreferencesRecord {
  return {
    userId: 'viewer',
    useAcademic: true,
    useSocial: true,
    useInterests: true,
    mutedSubjectIds: [],
    mutedProfileIds: [],
    prioritizedSubjectIds: [],
    revision: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function resource(
  index = 0,
  overrides: Partial<ResourceRecord> = {},
): ResourceRecord {
  return {
    id: `4000000${index}-0000-4000-8000-00000000000${index}`,
    authorUserId: `resource-author-${index}`,
    assetId: `5000000${index}-0000-4000-8000-00000000000${index}`,
    title: `Recurso ${index}`,
    description: 'SQL normalización',
    tags: ['SQL'],
    searchText: 'recurso sql normalización',
    subjectId: index % 2 === 0 ? subjectId : otherSubjectId,
    courseOfferingId: null,
    visibility: 'public',
    moderationState: 'available',
    revision: 1,
    createdAt: new Date(now.getTime() - index * 60_000),
    updatedAt: new Date(now.getTime() - index * 60_000),
    ...overrides,
  };
}

function question(
  index = 0,
  overrides: Partial<QuestionRecord> = {},
): QuestionRecord {
  return {
    id: `6000000${index}-0000-4000-8000-00000000000${index}`,
    authorUserId: `question-author-${index}`,
    subjectId: index % 2 === 0 ? subjectId : otherSubjectId,
    courseOfferingId: null,
    title: `Pregunta ${index}`,
    body: '¿Cómo normalizo una base de datos SQL?',
    searchText: 'pregunta normalizo base datos sql',
    state: 'open',
    moderationState: 'available',
    answerCount: index % 2,
    acceptedAnswerId: null,
    revision: 1,
    createdAt: new Date(now.getTime() - index * 90_000),
    updatedAt: new Date(now.getTime() - index * 90_000),
    ...overrides,
  };
}

function store(): jest.Mocked<FeedStore> {
  return {
    getOrCreatePreferences: jest.fn(),
    updatePreferences: jest.fn(),
    listFeedback: jest.fn(),
    setFeedback: jest.fn(),
    clearFeedback: jest.fn(),
  };
}

function dependencies() {
  const academic = {
    listSubjectParticipations: jest.fn(),
    resolveResourceContext: jest.fn(),
    getCatalogNode: jest.fn(),
  } as unknown as jest.Mocked<AcademicService>;
  const profiles = {
    getFeedSignals: jest.fn(),
    getAttributionsForUsers: jest.fn(),
    resolveUserIdByProfileId: jest.fn(),
  } as unknown as jest.Mocked<ProfileService>;
  const resources = {
    getFeedCandidates: jest.fn(),
    get: jest.fn(),
  } as unknown as jest.Mocked<ResourceService>;
  const qa = {
    getFeedCandidates: jest.fn(),
    get: jest.fn(),
  } as unknown as jest.Mocked<QaService>;
  const social = {
    getFeedRelations: jest.fn(),
  } as unknown as jest.Mocked<SocialService>;
  const organizations = {
    getFeedCandidates: jest.fn(),
    getFeedTarget: jest.fn(),
  } as unknown as jest.Mocked<OrganizationService>;

  return { academic, profiles, resources, qa, social, organizations };
}

async function expectHttpCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await promise;
    throw new Error(`Expected HTTP error ${code}`);
  } catch (error) {
    if (!(error instanceof HttpException)) throw error;
    expect(error.getResponse()).toMatchObject({ code });
  }
}

function configureDefaults(
  feedStore: jest.Mocked<FeedStore>,
  deps: ReturnType<typeof dependencies>,
  pref = preferences(),
) {
  feedStore.getOrCreatePreferences.mockResolvedValue(pref);
  feedStore.listFeedback.mockResolvedValue([]);
  deps.academic.listSubjectParticipations.mockResolvedValue({
    participations: [],
  });
  deps.academic.resolveResourceContext.mockImplementation((id) =>
    Promise.resolve({
      subjectId: id,
      courseOfferingId: null,
    }),
  );
  deps.academic.getCatalogNode.mockImplementation((id) =>
    Promise.resolve({
      node: {
        id,
        kind: 'subject',
        name: id === subjectId ? 'Base de Datos' : 'Algoritmos',
        aliases: [],
        parentIds: [],
        status: 'active',
        redirectToId: undefined,
        provenance: {
          authorityTier: 'C',
          sourceKey: 'test',
          sourceUrl: 'https://example.test/catalog',
          externalId: id,
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
  deps.profiles.getFeedSignals.mockResolvedValue({
    profileId,
    skills: ['SQL'],
    interests: ['datos'],
    helpTopics: ['normalización'],
    learningTopics: ['arquitectura'],
    recommendationSignals: {
      academicContext: true,
      learning: true,
      skillsInterests: true,
    },
  });
  deps.profiles.resolveUserIdByProfileId.mockResolvedValue('target-user');
  deps.profiles.getAttributionsForUsers.mockImplementation((userIds) =>
    Promise.resolve(
      new Map(
        userIds.map((userId, index) => [
          userId,
          {
            profileId: `7000000${index}-0000-4000-8000-00000000000${index}`,
            displayName: `Autor ${index}`,
            avatarUrl: null,
          },
        ]),
      ),
    ),
  );
  deps.resources.getFeedCandidates.mockResolvedValue([]);
  deps.qa.getFeedCandidates.mockResolvedValue([]);
  deps.social.getFeedRelations.mockResolvedValue({
    followingUserIds: [],
    connectionUserIds: [],
    truncated: false,
  });
  deps.organizations.getFeedCandidates.mockResolvedValue([]);
}

function service(
  feedStore: jest.Mocked<FeedStore>,
  deps: ReturnType<typeof dependencies>,
) {
  return new FeedService(
    feedStore,
    deps.academic,
    deps.profiles,
    deps.resources,
    deps.qa,
    deps.social,
    deps.organizations,
  );
}

describe('FeedService', () => {
  it('applies Profile recommendation consent as an upper boundary', async () => {
    const feedStore = store();
    const deps = dependencies();
    configureDefaults(feedStore, deps);
    deps.profiles.getFeedSignals.mockResolvedValue({
      profileId,
      skills: ['SQL'],
      interests: [],
      helpTopics: [],
      learningTopics: [],
      recommendationSignals: {
        academicContext: false,
        learning: false,
        skillsInterests: false,
      },
    });

    const result = await service(feedStore, deps).getPreferences('viewer');

    expect(result.effectiveSignals).toEqual({
      academic: false,
      social: true,
      interests: false,
    });
  });

  it('canonicalizes preferences and lets mute win over priority', async () => {
    const feedStore = store();
    const deps = dependencies();
    configureDefaults(feedStore, deps);
    const canonical = '88888888-8888-4888-8888-888888888888';
    deps.academic.resolveResourceContext.mockResolvedValue({
      subjectId: canonical,
      courseOfferingId: null,
    });
    feedStore.updatePreferences.mockImplementation((_user, _revision, patch) =>
      Promise.resolve(
        preferences({
          ...patch,
          revision: 2,
        }),
      ),
    );

    const result = await service(feedStore, deps).updatePreferences('viewer', {
      expectedRevision: 1,
      useAcademic: false,
      mutedSubjectIds: [subjectId],
      mutedProfileIds: [profileId],
      prioritizedSubjectIds: [otherSubjectId],
    });

    expect(feedStore.updatePreferences.mock.calls[0]).toEqual([
      'viewer',
      1,
      expect.objectContaining({
        useAcademic: false,
        mutedSubjectIds: [canonical],
        mutedProfileIds: [profileId],
        prioritizedSubjectIds: [],
      }),
    ]);
    expect(result.preferences.revision).toBe(2);
  });

  it('rejects stale preference revisions before writing', async () => {
    const feedStore = store();
    const deps = dependencies();
    configureDefaults(feedStore, deps, preferences({ revision: 4 }));

    await expect(
      service(feedStore, deps).updatePreferences('viewer', {
        expectedRevision: 3,
        useSocial: false,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(feedStore.updatePreferences.mock.calls).toHaveLength(0);
  });

  it('rejects unknown muted Profiles', async () => {
    const feedStore = store();
    const deps = dependencies();
    configureDefaults(feedStore, deps);
    deps.profiles.resolveUserIdByProfileId.mockResolvedValue(null);

    await expectHttpCode(
      service(feedStore, deps).updatePreferences('viewer', {
        expectedRevision: 1,
        mutedProfileIds: [profileId],
      }),
      'FEED_PROFILE_NOT_FOUND',
    );
  });

  it('returns an explicit empty Academic feed without guessing context', async () => {
    const feedStore = store();
    const deps = dependencies();
    configureDefaults(feedStore, deps);

    const result = await service(feedStore, deps).academicFeed('viewer', {
      limit: 20,
    });

    expect(result).toEqual({
      items: [],
      nextCursor: null,
      stopReason: 'end',
      context: { subjectIds: [] },
    });
    expect(deps.resources.getFeedCandidates.mock.calls).toHaveLength(0);
    expect(deps.qa.getFeedCandidates.mock.calls).toHaveLength(0);
  });

  it('uses current Subjects and deterministic chronology in Academic feed', async () => {
    const feedStore = store();
    const deps = dependencies();
    configureDefaults(feedStore, deps);
    deps.academic.listSubjectParticipations.mockResolvedValue({
      participations: [
        {
          id: 'part-1',
          subjectId,
          state: 'current',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      ],
    } as never);
    deps.resources.getFeedCandidates.mockResolvedValue([
      resource(2),
      resource(0),
    ]);
    deps.qa.getFeedCandidates.mockResolvedValue([question(1)]);

    const result = await service(feedStore, deps).academicFeed('viewer', {
      limit: 5,
    });

    expect(result.context.subjectIds).toEqual([subjectId]);
    expect(result.items.map((item) => item.id)).toEqual([
      resource(0).id,
      question(1).id,
      resource(2).id,
    ]);
    expect(
      result.items.every((item) => item.why.includes('current_subject')),
    ).toBe(true);
  });

  it('honors mutes before ranking For You candidates', async () => {
    const feedStore = store();
    const deps = dependencies();
    const mutedAuthorProfile = '99999999-9999-4999-8999-999999999999';
    configureDefaults(
      feedStore,
      deps,
      preferences({
        mutedSubjectIds: [otherSubjectId],
        mutedProfileIds: [mutedAuthorProfile],
      }),
    );
    const rows = [resource(0), resource(1), resource(2)];
    deps.resources.getFeedCandidates.mockResolvedValue(rows);
    deps.profiles.getAttributionsForUsers.mockResolvedValue(
      new Map([
        [
          rows[0].authorUserId,
          {
            profileId: mutedAuthorProfile,
            displayName: 'Muted',
            avatarUrl: null,
          },
        ],
        [
          rows[1].authorUserId,
          {
            profileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            displayName: 'Other subject',
            avatarUrl: null,
          },
        ],
        [
          rows[2].authorUserId,
          {
            profileId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            displayName: 'Visible',
            avatarUrl: null,
          },
        ],
      ]),
    );

    const result = await service(feedStore, deps).forYou('viewer', {
      limit: 20,
      mode: 'balanced',
      order: 'ranked',
    });

    expect(result.items.map((item) => item.id)).toEqual([rows[2].id]);
  });

  it('uses academic, social and interest signals only when enabled', async () => {
    const feedStore = store();
    const deps = dependencies();
    configureDefaults(feedStore, deps);
    deps.academic.listSubjectParticipations.mockResolvedValue({
      participations: [{ id: 'part', subjectId, state: 'current' }],
    } as never);
    deps.social.getFeedRelations.mockResolvedValue({
      followingUserIds: ['followed'],
      connectionUserIds: ['connected'],
      truncated: false,
    });
    const row = question(0, {
      authorUserId: 'connected',
      subjectId,
      answerCount: 0,
    });
    deps.qa.getFeedCandidates.mockResolvedValue([row]);

    const result = await service(feedStore, deps).forYou('viewer', {
      limit: 10,
      mode: 'study',
      order: 'ranked',
    });

    expect(result.effectiveSignals).toEqual({
      academic: true,
      social: true,
      interests: true,
      relationWindowTruncated: false,
    });
    expect(result.items[0]?.why).toEqual(
      expect.arrayContaining([
        'current_subject',
        'connection',
        'interest_match',
        'unanswered_question',
      ]),
    );
  });

  it('provides a chronological non-personalized For You order', async () => {
    const feedStore = store();
    const deps = dependencies();
    configureDefaults(feedStore, deps);
    const older = resource(3);
    const newer = question(0);
    deps.resources.getFeedCandidates.mockResolvedValue([older]);
    deps.qa.getFeedCandidates.mockResolvedValue([newer]);

    const result = await service(feedStore, deps).forYou('viewer', {
      limit: 10,
      mode: 'balanced',
      order: 'chronological',
    });

    expect(result.items.map((item) => item.id)).toEqual([newer.id, older.id]);
  });

  it('rejects a cursor after Feed state revision changes', async () => {
    const feedStore = store();
    const deps = dependencies();
    configureDefaults(feedStore, deps);
    const rows = Array.from({ length: 5 }, (_, index) => resource(index));
    deps.resources.getFeedCandidates.mockResolvedValue(rows);

    const first = await service(feedStore, deps).forYou('viewer', {
      limit: 2,
      mode: 'balanced',
      order: 'ranked',
    });
    expect(first.nextCursor).not.toBeNull();

    feedStore.getOrCreatePreferences.mockResolvedValue(
      preferences({ revision: 2 }),
    );

    await expectHttpCode(
      service(feedStore, deps).forYou('viewer', {
        limit: 2,
        cursor: first.nextCursor ?? undefined,
        mode: 'balanced',
        order: 'ranked',
      }),
      'FEED_CURSOR_STALE',
    );
  });

  it('rejects reuse of a cursor under another request context', async () => {
    const feedStore = store();
    const deps = dependencies();
    configureDefaults(feedStore, deps);
    deps.resources.getFeedCandidates.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => resource(index)),
    );

    const first = await service(feedStore, deps).forYou('viewer', {
      limit: 2,
      mode: 'balanced',
      order: 'ranked',
    });

    await expectHttpCode(
      service(feedStore, deps).forYou('viewer', {
        limit: 3,
        cursor: first.nextCursor ?? undefined,
        mode: 'balanced',
        order: 'ranked',
      }),
      'FEED_CURSOR_CONTEXT_MISMATCH',
    );
  });

  it('returns a natural break after the third page even with more supply', async () => {
    const feedStore = store();
    const deps = dependencies();
    configureDefaults(feedStore, deps);
    const rows = Array.from({ length: 10 }, (_, index) =>
      resource(index, {
        subjectId: `8000000${index}-0000-4000-8000-00000000000${index}`,
      }),
    );
    deps.resources.getFeedCandidates.mockResolvedValue(rows);

    const first = await service(feedStore, deps).forYou('viewer', {
      limit: 2,
      mode: 'balanced',
      order: 'ranked',
    });
    const second = await service(feedStore, deps).forYou('viewer', {
      limit: 2,
      cursor: first.nextCursor ?? undefined,
      mode: 'balanced',
      order: 'ranked',
    });
    const third = await service(feedStore, deps).forYou('viewer', {
      limit: 2,
      cursor: second.nextCursor ?? undefined,
      mode: 'balanced',
      order: 'ranked',
    });

    expect(first.nextCursor).not.toBeNull();
    expect(second.nextCursor).not.toBeNull();
    expect(third.nextCursor).toBeNull();
    expect(third.stopReason).toBe('natural_break');
  });

  it('records idempotent readable-target feedback and returns new revision', async () => {
    const feedStore = store();
    const deps = dependencies();
    configureDefaults(feedStore, deps);
    deps.resources.get.mockResolvedValue({ resource: {} } as never);
    feedStore.setFeedback.mockResolvedValue({
      feedback: {
        userId: 'viewer',
        targetType: 'resource',
        targetId: resource(0).id,
        signal: 'more',
        createdAt: now,
        updatedAt: now,
      },
      changed: true,
      revision: 2,
    });

    const result = await service(feedStore, deps).setFeedback(
      'viewer',
      'resource',
      resource(0).id,
      'more',
    );

    expect(result.changed).toBe(true);
    expect(result.revision).toBe(2);
  });

  it('hides source-domain not-found behind the Feed feedback contract', async () => {
    const feedStore = store();
    const deps = dependencies();
    configureDefaults(feedStore, deps);
    deps.qa.get.mockRejectedValue(new NotFoundException());

    await expectHttpCode(
      service(feedStore, deps).setFeedback(
        'viewer',
        'question',
        question(0).id,
        'less',
      ),
      'FEED_FEEDBACK_TARGET_NOT_FOUND',
    );
  });

  it('clears feedback without requiring the target to remain readable', async () => {
    const feedStore = store();
    const deps = dependencies();
    configureDefaults(feedStore, deps);
    feedStore.clearFeedback.mockResolvedValue({
      changed: true,
      revision: 3,
    });

    await expect(
      service(feedStore, deps).clearFeedback(
        'viewer',
        'resource',
        resource(0).id,
      ),
    ).resolves.toEqual({ changed: true, revision: 3 });

    expect(deps.resources.get.mock.calls).toHaveLength(0);
  });

  it('rejects malformed feed cursors', async () => {
    const feedStore = store();
    const deps = dependencies();
    configureDefaults(feedStore, deps);

    await expect(
      service(feedStore, deps).forYou('viewer', {
        limit: 20,
        cursor: 'not-a-valid-cursor',
        mode: 'balanced',
        order: 'ranked',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('includes organization posts only from explicitly followed organizations', async () => {
    const feedStore = store();
    const deps = dependencies();
    configureDefaults(feedStore, deps);
    deps.organizations.getFeedCandidates.mockResolvedValue([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        organizationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        organizationName: 'Centro de Estudiantes',
        organizationAvatarUrl: null,
        verificationState: 'verified',
        createdByUserId: 'manager-user',
        subjectId: null,
        title: 'Asamblea abierta',
        body: 'Encuentro informativo para estudiantes.',
        publishedAt: now,
      },
    ]);

    const result = await service(feedStore, deps).forYou('viewer', {
      limit: 10,
      mode: 'community',
      order: 'ranked',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      type: 'organization_post',
      title: 'Asamblea abierta',
      author: {
        profileId: null,
        displayName: 'Centro de Estudiantes',
      },
      source: {
        kind: 'campus_organization',
        organization: {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          verificationState: 'verified',
        },
      },
      academic: { subject: null },
    });
    expect(result.items[0]?.why).toContain('organization_following');
    const attributedUserIds =
      deps.profiles.getAttributionsForUsers.mock.calls.flatMap(
        ([userIds]) => userIds,
      );
    expect(attributedUserIds).not.toContain('manager-user');
  });

  it('excludes organization posts when social feed signals are disabled', async () => {
    const feedStore = store();
    const deps = dependencies();
    configureDefaults(feedStore, deps, preferences({ useSocial: false }));

    await service(feedStore, deps).forYou('viewer', {
      limit: 10,
      mode: 'balanced',
      order: 'ranked',
    });

    expect(deps.organizations.getFeedCandidates.mock.calls).toHaveLength(0);
  });

  it('validates organization post feedback through Organization authority', async () => {
    const feedStore = store();
    const deps = dependencies();
    configureDefaults(feedStore, deps);
    deps.organizations.getFeedTarget.mockResolvedValue({
      post: {},
      organization: {},
    } as never);
    feedStore.setFeedback.mockResolvedValue({
      feedback: {
        userId: 'viewer',
        targetType: 'organization_post',
        targetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        signal: 'more',
        createdAt: now,
        updatedAt: now,
      },
      changed: true,
      revision: 2,
    });

    await expect(
      service(feedStore, deps).setFeedback(
        'viewer',
        'organization_post',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'more',
      ),
    ).resolves.toMatchObject({ changed: true, revision: 2 });

    expect(deps.organizations.getFeedTarget.mock.calls[0]).toEqual([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ]);
  });
});
