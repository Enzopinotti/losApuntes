import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { AcademicService } from '../../academic/domain/academic.service';
import {
  ProfileAccountInactiveError,
  ProfileAlreadyExistsError,
  type ProfileStore,
} from './profile.store';
import { ProfileService } from './profile.service';
import type { ProfileActivityRecord, ProfileRecord } from './profile.types';

const now = new Date('2026-09-23T03:00:00.000Z');

function profile(overrides: Partial<ProfileRecord> = {}): ProfileRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    userId: 'user-1',
    displayName: 'Enzo',
    bio: null,
    avatarUrl: null,
    languages: [],
    skills: [],
    interests: [],
    helpTopics: [],
    learningTopics: [],
    professional: {
      headline: null,
      careerDiscoveryOptIn: false,
    },
    presentation: {
      accentPreset: 'default',
      coverPreset: 'none',
      sectionOrder: [
        'about',
        'academic',
        'learning',
        'activities',
        'skills',
        'professional',
        'contributions',
      ],
    },
    visibility: {
      about: 'public',
      academic: 'private',
      learning: 'private',
      activities: 'private',
      skills: 'private',
      professional: 'private',
      contributions: 'private',
    },
    recommendationSignals: {
      academicContext: true,
      learning: true,
      skillsInterests: true,
    },
    revision: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function activity(
  overrides: Partial<ProfileActivityRecord> = {},
): ProfileActivityRecord {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    userId: 'user-1',
    type: 'project',
    title: 'Proyecto',
    description: null,
    url: null,
    startedOn: null,
    endedOn: null,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function activityPage(items: ProfileActivityRecord[], hasMore = false) {
  return { items, hasMore };
}

async function rejectedUnprocessable(
  operation: Promise<unknown>,
): Promise<UnprocessableEntityException> {
  try {
    await operation;
  } catch (error) {
    if (error instanceof UnprocessableEntityException) return error;
    throw error;
  }

  throw new Error(
    'Expected operation to reject with UnprocessableEntityException',
  );
}

function store(): jest.Mocked<ProfileStore> {
  return {
    findProfileByUserId: jest.fn(),
    findProfileById: jest.fn(),
    findProfilesByUserIds: jest.fn(),
    searchPublicProfiles: jest.fn(),
    createProfile: jest.fn(),
    updateProfile: jest.fn(),
    listActivitiesForUser: jest.fn(),
    findActivityForUser: jest.fn(),
    createActivity: jest.fn(),
    updateActivity: jest.fn(),
    deleteActivity: jest.fn(),
  };
}

type AcademicProjectionApi = Pick<
  AcademicService,
  'listAffiliations' | 'listSubjectParticipations' | 'getCurrentContext'
>;

function academic(): jest.Mocked<AcademicProjectionApi> {
  return {
    listAffiliations: jest.fn(),
    listSubjectParticipations: jest.fn(),
    getCurrentContext: jest.fn(),
  };
}

function service(
  profileStore: jest.Mocked<ProfileStore>,
  academicService: jest.Mocked<AcademicProjectionApi>,
) {
  return new ProfileService(
    profileStore,
    academicService as unknown as AcademicService,
  );
}

function configureAcademic(
  academicService: jest.Mocked<AcademicProjectionApi>,
): void {
  academicService.listAffiliations.mockResolvedValue({
    affiliations: [],
    truncated: false,
    limit: 50,
  });
  academicService.listSubjectParticipations.mockResolvedValue({
    participations: [],
    truncated: false,
    limit: 100,
  });
  academicService.getCurrentContext.mockResolvedValue({ context: null });
}

describe('ProfileService', () => {
  it('keeps an account valid before profile onboarding', async () => {
    const profileStore = store();
    const academicService = academic();
    profileStore.findProfileByUserId.mockResolvedValue(null);

    await expect(
      service(profileStore, academicService).getOwnerProfile('user-1'),
    ).resolves.toEqual({
      profile: null,
      onboardingRequired: true,
    });

    expect(academicService.listAffiliations).not.toHaveBeenCalled();
  });

  it('provides privacy-safe resource attribution from public profile identity', async () => {
    const profileStore = store();
    const academicService = academic();
    profileStore.findProfileByUserId.mockResolvedValue(
      profile({
        displayName: 'Enzo Pinotti',
        avatarUrl: 'https://example.test/avatar.png',
      }),
    );

    await expect(
      service(profileStore, academicService).getAttributionForUser('user-1'),
    ).resolves.toEqual({
      profileId: '11111111-1111-4111-8111-111111111111',
      displayName: 'Enzo Pinotti',
      avatarUrl: 'https://example.test/avatar.png',
    });
  });

  it('masks private profile identity in resource attribution', async () => {
    const profileStore = store();
    const academicService = academic();
    profileStore.findProfileByUserId.mockResolvedValue(
      profile({
        displayName: 'Nombre privado',
        avatarUrl: 'https://example.test/private.png',
        visibility: {
          ...profile().visibility,
          about: 'private',
        },
      }),
    );

    await expect(
      service(profileStore, academicService).getAttributionForUser('user-1'),
    ).resolves.toEqual({
      profileId: '11111111-1111-4111-8111-111111111111',
      displayName: 'Usuario de Los Apuntes',
      avatarUrl: null,
    });
  });

  it('tombstones public identity for closed accounts while preserving profile id', async () => {
    const profileStore = store();
    const academicService = academic();
    profileStore.findProfileByUserId.mockResolvedValue(
      profile({
        lifecycleState: 'closed',
        displayName: 'No debe exponerse',
        avatarUrl: 'https://example.test/private.png',
      }),
    );

    await expect(
      service(profileStore, academicService).getAttributionForUser('user-1'),
    ).resolves.toEqual({
      profileId: '11111111-1111-4111-8111-111111111111',
      displayName: 'Usuario de Los Apuntes',
      avatarUrl: null,
    });
  });

  it('keeps resource attribution optional before profile onboarding', async () => {
    const profileStore = store();
    const academicService = academic();
    profileStore.findProfileByUserId.mockResolvedValue(null);

    await expect(
      service(profileStore, academicService).getAttributionForUser('user-1'),
    ).resolves.toBeNull();
  });

  it('resolves public profile ids to internal account authority without exposing it', async () => {
    const profileStore = store();
    const academicService = academic();
    profileStore.findProfileById
      .mockResolvedValueOnce(profile())
      .mockResolvedValueOnce(null);

    await expect(
      service(profileStore, academicService).resolveUserIdByProfileId(
        '11111111-1111-4111-8111-111111111111',
      ),
    ).resolves.toBe('user-1');

    await expect(
      service(profileStore, academicService).resolveUserIdByProfileId(
        '22222222-2222-4222-8222-222222222222',
      ),
    ).resolves.toBeNull();
  });

  it('creates a normalized minimal profile with privacy-safe defaults', async () => {
    const profileStore = store();
    const academicService = academic();
    const created = profile({
      displayName: 'Enzo Pinotti',
      skills: ['SQL'],
    });

    profileStore.createProfile.mockResolvedValue(created);

    const result = await service(profileStore, academicService).createProfile(
      'user-1',
      {
        displayName: '  Enzo   Pinotti  ',
        skills: [' SQL ', 'sql'],
      },
    );

    expect(result.profile.displayName).toBe('Enzo Pinotti');
    const createInput = profileStore.createProfile.mock.calls[0]?.[0];
    expect(createInput?.userId).toBe('user-1');
    expect(createInput?.displayName).toBe('Enzo Pinotti');
    expect(createInput?.skills).toEqual(['SQL']);
    expect(createInput?.professional).toEqual({
      headline: null,
      careerDiscoveryOptIn: false,
    });
    expect(createInput?.visibility.about).toBe('public');
    expect(createInput?.visibility.academic).toBe('private');
    expect(createInput?.visibility.professional).toBe('private');
  });

  it('maps persistence creation races to a stable conflict', async () => {
    const profileStore = store();
    const academicService = academic();
    profileStore.createProfile.mockRejectedValue(
      new ProfileAlreadyExistsError(),
    );

    await expect(
      service(profileStore, academicService).createProfile('user-1', {
        displayName: 'Enzo',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('fails closed when account closure wins first-profile creation', async () => {
    const profileStore = store();
    const academicService = academic();
    profileStore.createProfile.mockRejectedValue(
      new ProfileAccountInactiveError(),
    );

    await expect(
      service(profileStore, academicService).createProfile('user-1', {
        displayName: 'Enzo',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('exports the complete owner profile independent of public visibility', async () => {
    const profileStore = store();
    const academicService = academic();
    const row = profile({
      lifecycleState: 'closed',
      bio: 'Private bio',
      skills: ['SQL'],
      professional: {
        headline: 'Private headline',
        careerDiscoveryOptIn: true,
      },
      visibility: {
        about: 'private',
        academic: 'private',
        learning: 'private',
        activities: 'private',
        skills: 'private',
        professional: 'private',
        contributions: 'private',
      },
      recommendationSignals: {
        academicContext: false,
        learning: true,
        skillsInterests: false,
      },
    });
    profileStore.findProfileByUserId.mockResolvedValue(row);

    await expect(
      service(profileStore, academicService).getAccountExportProfile('user-1'),
    ).resolves.toEqual({
      lifecycleState: 'closed',
      id: row.id,
      displayName: row.displayName,
      bio: 'Private bio',
      avatarUrl: row.avatarUrl,
      languages: row.languages,
      skills: ['SQL'],
      interests: row.interests,
      helpTopics: row.helpTopics,
      learningTopics: row.learningTopics,
      professional: {
        headline: 'Private headline',
        careerDiscoveryOptIn: true,
      },
      presentation: row.presentation,
      visibility: row.visibility,
      recommendationSignals: {
        academicContext: false,
        learning: true,
        skillsInterests: false,
      },
      revision: row.revision,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    expect(academicService.listAffiliations).not.toHaveBeenCalled();
  });

  it('exports profile activities through the existing bounded cursor contract', async () => {
    const profileStore = store();
    const academicService = academic();
    const first = activity({
      createdAt: new Date('2026-09-23T03:00:00.000Z'),
    });
    profileStore.listActivitiesForUser.mockResolvedValue(
      activityPage([first], true),
    );

    const firstPage = await service(
      profileStore,
      academicService,
    ).listAccountExportActivities('user-1', {
      limit: 100,
      cursor: null,
    });

    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(profileStore.listActivitiesForUser.mock.calls).toEqual([
      [{ userId: 'user-1', limit: 50, after: undefined }],
    ]);

    profileStore.listActivitiesForUser.mockResolvedValueOnce(
      activityPage([activity({ id: 'next-activity' })]),
    );

    await service(profileStore, academicService).listAccountExportActivities(
      'user-1',
      {
        limit: 100,
        cursor: firstPage.nextCursor,
      },
    );

    expect(profileStore.listActivitiesForUser.mock.calls.at(-1)).toEqual([
      {
        userId: 'user-1',
        limit: 50,
        after: {
          createdAt: first.createdAt,
          id: first.id,
        },
      },
    ]);
  });

  it('composes owner academic state without duplicating it in profile storage', async () => {
    const profileStore = store();
    const academicService = academic();
    const row = profile();
    const act = activity();

    profileStore.findProfileByUserId.mockResolvedValue(row);
    profileStore.listActivitiesForUser.mockResolvedValue(activityPage([act]));
    academicService.listAffiliations.mockResolvedValue({
      affiliations: [{ id: 'aff-1' }] as never[],
      truncated: false,
      limit: 50,
    });
    academicService.listSubjectParticipations.mockResolvedValue({
      participations: [{ id: 'part-1' }] as never[],
      truncated: false,
      limit: 100,
    });
    academicService.getCurrentContext.mockResolvedValue({
      context: { affiliationId: 'aff-1' } as never,
    });

    const result = await service(profileStore, academicService).getOwnerProfile(
      'user-1',
    );

    expect(result.onboardingRequired).toBe(false);
    if (
      !('academic' in result) ||
      result.academic === undefined ||
      result.activities === undefined ||
      result.contributions === undefined
    ) {
      throw new Error('Expected an onboarded profile projection');
    }

    expect(result.academic.affiliations).toHaveLength(1);
    expect(result.activities[0]?.id).toBe(act.id);
    expect(result.activitiesNextCursor).toBeNull();
    expect(result.activitiesLimit).toBe(20);
    expect(profileStore.listActivitiesForUser.mock.calls).toContainEqual([
      { userId: 'user-1', limit: 20, after: undefined },
    ]);
    expect(result.contributions.available).toBe(false);
  });

  it('continues owner activity inventory with an opaque stable cursor', async () => {
    const profileStore = store();
    const academicService = academic();
    configureAcademic(academicService);
    const first = activity({
      id: '22222222-2222-4222-8222-222222222222',
      createdAt: new Date('2026-09-23T03:00:00.000Z'),
    });
    const second = activity({
      id: '33333333-3333-4333-8333-333333333333',
      createdAt: new Date('2026-09-22T03:00:00.000Z'),
    });

    profileStore.findProfileByUserId.mockResolvedValue(profile());
    profileStore.listActivitiesForUser
      .mockResolvedValueOnce(activityPage([first], true))
      .mockResolvedValueOnce(activityPage([second]));

    const initial = await service(
      profileStore,
      academicService,
    ).getOwnerProfile('user-1');

    if (initial.onboardingRequired) {
      throw new Error('Expected onboarded profile');
    }
    expect(initial.activitiesNextCursor).toEqual(expect.any(String));

    const next = await service(
      profileStore,
      academicService,
    ).listOwnerActivities('user-1', {
      limit: 20,
      cursor: initial.activitiesNextCursor ?? undefined,
    });

    expect(next.items.map((item) => item.id)).toEqual([second.id]);
    expect(next.nextCursor).toBeNull();
    expect(profileStore.listActivitiesForUser.mock.calls.at(-1)).toEqual([
      {
        userId: 'user-1',
        limit: 20,
        after: {
          createdAt: first.createdAt,
          id: first.id,
        },
      },
    ]);
  });

  it('rejects malformed activity cursors before querying persistence', async () => {
    const profileStore = store();
    const academicService = academic();
    profileStore.findProfileByUserId.mockResolvedValue(profile());

    const error = await rejectedUnprocessable(
      service(profileStore, academicService).listOwnerActivities('user-1', {
        limit: 20,
        cursor: 'not-a-valid-cursor',
      }),
    );

    expect(error.getResponse()).toMatchObject({
      code: 'PROFILE_ACTIVITY_CURSOR_INVALID',
    });
    expect(profileStore.listActivitiesForUser.mock.calls).toHaveLength(0);
  });

  it('updates nested settings with optimistic concurrency', async () => {
    const profileStore = store();
    const academicService = academic();
    const existing = profile({
      professional: {
        headline: 'Estudiante',
        careerDiscoveryOptIn: false,
      },
    });
    const updated = profile({
      revision: 2,
      professional: {
        headline: 'Ingeniería',
        careerDiscoveryOptIn: true,
      },
    });

    profileStore.findProfileByUserId.mockResolvedValue(existing);
    profileStore.updateProfile.mockResolvedValue(updated);

    const result = await service(profileStore, academicService).updateProfile(
      'user-1',
      {
        expectedRevision: 1,
        professional: {
          headline: ' Ingeniería ',
          careerDiscoveryOptIn: true,
        },
      },
    );

    expect(result.profile.revision).toBe(2);
    const updateCall = profileStore.updateProfile.mock.calls[0];
    expect(updateCall?.[0]).toBe('user-1');
    expect(updateCall?.[1]).toBe(1);
    expect(updateCall?.[2]?.professional).toEqual({
      headline: 'Ingeniería',
      careerDiscoveryOptIn: true,
    });
  });

  it('rejects stale profile writes', async () => {
    const profileStore = store();
    const academicService = academic();
    profileStore.findProfileByUserId.mockResolvedValue(profile());
    profileStore.updateProfile.mockResolvedValue(null);

    await expect(
      service(profileStore, academicService).updateProfile('user-1', {
        expectedRevision: 1,
        bio: 'Cambio',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects incomplete or duplicated section order', async () => {
    const profileStore = store();
    const academicService = academic();
    profileStore.findProfileByUserId.mockResolvedValue(profile());

    await expect(
      service(profileStore, academicService).updateProfile('user-1', {
        expectedRevision: 1,
        presentation: {
          sectionOrder: ['about', 'academic'],
        },
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('hides a closed profile from public profile reads', async () => {
    const profileStore = store();
    const academicService = academic();
    profileStore.findProfileById.mockResolvedValue(
      profile({ lifecycleState: 'closed' }),
    );

    await expect(
      service(profileStore, academicService).getPublicProfile(
        '11111111-1111-4111-8111-111111111111',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(academicService.listAffiliations).not.toHaveBeenCalled();
  });

  it('emits only explicitly public sections to anonymous viewers', async () => {
    const profileStore = store();
    const academicService = academic();
    configureAcademic(academicService);
    const row = profile({
      bio: 'Bio pública',
      skills: ['SQL'],
      professional: {
        headline: 'Privado',
        careerDiscoveryOptIn: true,
      },
      visibility: {
        about: 'public',
        academic: 'university',
        learning: 'private',
        activities: 'connections',
        skills: 'public',
        professional: 'private',
        contributions: 'private',
      },
    });
    profileStore.findProfileById.mockResolvedValue(row);

    const result = await service(
      profileStore,
      academicService,
    ).getPublicProfile(row.id);

    expect(result.profile.id).toBe(row.id);
    if (!('about' in result.profile) || !result.profile.about) {
      throw new Error('Expected public about section');
    }
    if (!('skills' in result.profile) || !result.profile.skills) {
      throw new Error('Expected public skills section');
    }
    expect(result.profile.about.bio).toBe('Bio pública');
    expect(result.profile.skills.skills).toEqual(['SQL']);
    expect(result.profile).not.toHaveProperty('academic');
    expect(result.profile).not.toHaveProperty('activities');
    expect(result.profile).not.toHaveProperty('professional');
    expect(result.profile).not.toHaveProperty('recommendationSignals');
    expect(academicService.listAffiliations).not.toHaveBeenCalled();
  });

  it('composes public academic and activity sections only when public', async () => {
    const profileStore = store();
    const academicService = academic();
    configureAcademic(academicService);
    const row = profile({
      visibility: {
        about: 'public',
        academic: 'public',
        learning: 'private',
        activities: 'public',
        skills: 'private',
        professional: 'private',
        contributions: 'private',
      },
    });
    profileStore.findProfileById.mockResolvedValue(row);
    profileStore.listActivitiesForUser.mockResolvedValue(
      activityPage([activity()]),
    );

    const result = await service(
      profileStore,
      academicService,
    ).getPublicProfile(row.id);

    expect(result.profile).toHaveProperty('academic');
    expect(result.profile).toHaveProperty('activities');
    expect(academicService.listAffiliations).toHaveBeenCalledWith('user-1');
  });

  it('paginates public activities only when that section is public', async () => {
    const profileStore = store();
    const academicService = academic();
    const publicRow = profile({
      visibility: {
        ...profile().visibility,
        activities: 'public',
      },
    });
    const hiddenRow = profile({
      visibility: {
        ...profile().visibility,
        activities: 'private',
      },
    });
    profileStore.findProfileById
      .mockResolvedValueOnce(publicRow)
      .mockResolvedValueOnce(hiddenRow);
    profileStore.listActivitiesForUser.mockResolvedValue(
      activityPage([activity()], true),
    );

    const visible = await service(
      profileStore,
      academicService,
    ).listPublicActivities(publicRow.id, { limit: 10 });
    expect(visible.items).toHaveLength(1);
    expect(visible.nextCursor).toEqual(expect.any(String));

    await expect(
      service(profileStore, academicService).listPublicActivities(
        hiddenRow.id,
        { limit: 10 },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(profileStore.listActivitiesForUser.mock.calls).toHaveLength(1);
  });

  it('requires an owner profile before creating activities', async () => {
    const profileStore = store();
    const academicService = academic();
    profileStore.findProfileByUserId.mockResolvedValue(null);

    await expect(
      service(profileStore, academicService).createActivity('user-1', {
        type: 'project',
        title: 'Proyecto',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates activities with cleaned content', async () => {
    const profileStore = store();
    const academicService = academic();
    const row = activity({
      title: 'Proyecto final',
      description: 'Descripción',
    });

    profileStore.findProfileByUserId.mockResolvedValue(profile());
    profileStore.createActivity.mockResolvedValue(row);

    const result = await service(profileStore, academicService).createActivity(
      'user-1',
      {
        type: 'project',
        title: ' Proyecto   final ',
        description: ' Descripción ',
        startedOn: '2026-01',
        endedOn: '2026-09',
      },
    );

    expect(result.activity.title).toBe('Proyecto final');
    const activityInput = profileStore.createActivity.mock.calls[0]?.[0];
    expect(activityInput?.title).toBe('Proyecto final');
    expect(activityInput?.description).toBe('Descripción');
  });

  it('rejects inverted activity periods on create and update', async () => {
    const profileStore = store();
    const academicService = academic();
    profileStore.findProfileByUserId.mockResolvedValue(profile());

    await expect(
      service(profileStore, academicService).createActivity('user-1', {
        type: 'project',
        title: 'Proyecto',
        startedOn: '2026-09',
        endedOn: '2026-01',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    const existing = activity({
      startedOn: '2026-02',
      endedOn: '2026-10',
    });
    profileStore.findActivityForUser.mockResolvedValue(existing);

    await expect(
      service(profileStore, academicService).updateActivity(
        'user-1',
        existing.id,
        {
          expectedRevision: 1,
          startedOn: '2026-11',
        },
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('updates owned activities and rejects stale revisions', async () => {
    const profileStore = store();
    const academicService = academic();
    const existing = activity();
    const updated = activity({ title: 'Nuevo título', revision: 2 });

    profileStore.findActivityForUser.mockResolvedValue(existing);
    profileStore.updateActivity
      .mockResolvedValueOnce(updated)
      .mockResolvedValueOnce(null);

    const ok = await service(profileStore, academicService).updateActivity(
      'user-1',
      existing.id,
      {
        expectedRevision: 1,
        title: ' Nuevo   título ',
      },
    );
    expect(ok.activity.title).toBe('Nuevo título');

    await expect(
      service(profileStore, academicService).updateActivity(
        'user-1',
        existing.id,
        {
          expectedRevision: 1,
          title: 'Otro',
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('hides cross-user activity IDs behind not-found', async () => {
    const profileStore = store();
    const academicService = academic();
    profileStore.findActivityForUser.mockResolvedValue(null);

    await expect(
      service(profileStore, academicService).updateActivity(
        'user-1',
        '22222222-2222-4222-8222-222222222222',
        {
          expectedRevision: 1,
          title: 'No autorizado',
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes only the owned expected revision', async () => {
    const profileStore = store();
    const academicService = academic();
    const existing = activity();
    profileStore.findActivityForUser.mockResolvedValue(existing);
    profileStore.deleteActivity
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(
      service(profileStore, academicService).deleteActivity(
        'user-1',
        existing.id,
        1,
      ),
    ).resolves.toBeUndefined();

    await expect(
      service(profileStore, academicService).deleteActivity(
        'user-1',
        existing.id,
        1,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('covers explicit optional profile creation controls', async () => {
    const profileStore = store();
    const academicService = academic();
    const created = profile({
      bio: 'Bio',
      avatarUrl: 'https://example.test/avatar.png',
      languages: ['es'],
      skills: ['SQL'],
      interests: ['datos'],
      helpTopics: ['bases de datos'],
      learningTopics: ['arquitectura'],
      professional: {
        headline: 'Estudiante',
        careerDiscoveryOptIn: true,
      },
      presentation: {
        accentPreset: 'indigo',
        coverPreset: 'paper',
        sectionOrder: [
          'about',
          'academic',
          'learning',
          'activities',
          'skills',
          'professional',
          'contributions',
        ],
      },
      visibility: {
        about: 'public',
        academic: 'public',
        learning: 'public',
        activities: 'public',
        skills: 'public',
        professional: 'public',
        contributions: 'public',
      },
      recommendationSignals: {
        academicContext: false,
        learning: false,
        skillsInterests: false,
      },
    });
    profileStore.createProfile.mockResolvedValue(created);

    await service(profileStore, academicService).createProfile('user-1', {
      displayName: 'Enzo',
      bio: ' Bio ',
      avatarUrl: 'https://example.test/avatar.png',
      languages: [' es '],
      skills: [' SQL '],
      interests: [' datos '],
      helpTopics: [' bases de datos '],
      learningTopics: [' arquitectura '],
      professional: {
        headline: ' Estudiante ',
        careerDiscoveryOptIn: true,
      },
      presentation: {
        accentPreset: 'indigo',
        coverPreset: 'paper',
        sectionOrder: [
          'about',
          'academic',
          'learning',
          'activities',
          'skills',
          'professional',
          'contributions',
        ],
      },
      visibility: {
        academic: 'public',
        learning: 'public',
        activities: 'public',
        skills: 'public',
        professional: 'public',
        contributions: 'public',
      },
      recommendationSignals: {
        academicContext: false,
        learning: false,
        skillsInterests: false,
      },
    });

    const createInput = profileStore.createProfile.mock.calls[0]?.[0];
    expect(createInput?.bio).toBe('Bio');
    expect(createInput?.professional.headline).toBe('Estudiante');
    expect(createInput?.professional.careerDiscoveryOptIn).toBe(true);
    expect(createInput?.presentation.accentPreset).toBe('indigo');
    expect(createInput?.recommendationSignals).toEqual({
      academicContext: false,
      learning: false,
      skillsInterests: false,
    });
  });

  it('rethrows unexpected persistence errors during profile creation', async () => {
    const profileStore = store();
    const academicService = academic();
    const persistenceError = new Error('persistence unavailable');
    profileStore.createProfile.mockRejectedValue(persistenceError);

    await expect(
      service(profileStore, academicService).createProfile('user-1', {
        displayName: 'Enzo',
      }),
    ).rejects.toBe(persistenceError);
  });

  it('updates every editable profile group without replacing academic truth', async () => {
    const profileStore = store();
    const academicService = academic();
    const existing = profile();
    const updated = profile({
      displayName: 'Enzo actualizado',
      revision: 2,
    });
    profileStore.findProfileByUserId.mockResolvedValue(existing);
    profileStore.updateProfile.mockResolvedValue(updated);

    await service(profileStore, academicService).updateProfile('user-1', {
      expectedRevision: 1,
      displayName: ' Enzo actualizado ',
      bio: null,
      avatarUrl: null,
      languages: [' es '],
      skills: [' SQL '],
      interests: [' datos '],
      helpTopics: [' bases '],
      learningTopics: [' sistemas '],
      professional: {
        headline: null,
        careerDiscoveryOptIn: true,
      },
      presentation: {
        accentPreset: 'emerald',
        coverPreset: 'gradient',
        sectionOrder: [
          'professional',
          'skills',
          'activities',
          'learning',
          'academic',
          'about',
          'contributions',
        ],
      },
      visibility: {
        skills: 'public',
      },
      recommendationSignals: {
        academicContext: false,
        learning: false,
        skillsInterests: false,
      },
    });

    const patch = profileStore.updateProfile.mock.calls[0]?.[2];
    expect(patch?.displayName).toBe('Enzo actualizado');
    expect(patch?.bio).toBeNull();
    expect(patch?.languages).toEqual(['es']);
    expect(patch?.skills).toEqual(['SQL']);
    expect(patch?.presentation?.accentPreset).toBe('emerald');
    expect(patch?.visibility?.skills).toBe('public');
    expect(patch?.recommendationSignals).toEqual({
      academicContext: false,
      learning: false,
      skillsInterests: false,
    });
  });

  it('projects every explicitly public section without leaking private controls', async () => {
    const profileStore = store();
    const academicService = academic();
    configureAcademic(academicService);
    const row = profile({
      helpTopics: ['SQL'],
      learningTopics: ['Arquitectura'],
      professional: {
        headline: 'Estudiante',
        careerDiscoveryOptIn: true,
      },
      visibility: {
        about: 'public',
        academic: 'public',
        learning: 'public',
        activities: 'public',
        skills: 'public',
        professional: 'public',
        contributions: 'public',
      },
    });
    profileStore.findProfileById.mockResolvedValue(row);
    profileStore.listActivitiesForUser.mockResolvedValue(activityPage([]));

    const result = await service(
      profileStore,
      academicService,
    ).getPublicProfile(row.id);

    expect(result.profile).toHaveProperty('learning');
    expect(result.profile).toHaveProperty('professional');
    expect(result.profile).toHaveProperty('contributions');
    expect(result.profile).not.toHaveProperty('recommendationSignals');
    expect(result.profile.professional).not.toHaveProperty(
      'careerDiscoveryOptIn',
    );
  });

  it('returns stable not-found for unknown public profiles', async () => {
    const profileStore = store();
    const academicService = academic();
    profileStore.findProfileById.mockResolvedValue(null);

    await expect(
      service(profileStore, academicService).getPublicProfile(
        '11111111-1111-4111-8111-111111111111',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('projects only public identity fields from people search', async () => {
    const profileStore = store();
    const academicService = academic();
    const row = profile({
      displayName: 'Ana Pública',
      bio: 'This must never be in search results',
      avatarUrl: 'https://example.test/avatar.png',
      skills: ['private-skill'],
      professional: {
        headline: 'Private headline',
        careerDiscoveryOptIn: true,
      },
    });
    profileStore.searchPublicProfiles.mockResolvedValue([row]);

    const result = await service(
      profileStore,
      academicService,
    ).searchPublicProfiles('  Ana   ', 8);

    expect(profileStore.searchPublicProfiles.mock.calls).toEqual([['Ana', 8]]);
    expect(result).toEqual({
      items: [
        {
          profileId: row.id,
          displayName: 'Ana Pública',
          avatarUrl: 'https://example.test/avatar.png',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('private-skill');
    expect(JSON.stringify(result)).not.toContain('Private headline');
    expect(JSON.stringify(result)).not.toContain('careerDiscoveryOptIn');
  });

  it('provides feed signals only from explicit Profile recommendation state', async () => {
    const profileStore = store();
    const academicService = academic();
    const row = profile({
      skills: ['SQL'],
      interests: ['datos'],
      helpTopics: ['normalización'],
      learningTopics: ['arquitectura'],
      recommendationSignals: {
        academicContext: false,
        learning: true,
        skillsInterests: false,
      },
    });
    profileStore.findProfileByUserId
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce(profile({ lifecycleState: 'closed' }))
      .mockResolvedValueOnce(null);

    const instance = service(profileStore, academicService);

    await expect(instance.getFeedSignals('user-1')).resolves.toEqual({
      profileId: row.id,
      skills: ['SQL'],
      interests: ['datos'],
      helpTopics: ['normalización'],
      learningTopics: ['arquitectura'],
      recommendationSignals: {
        academicContext: false,
        learning: true,
        skillsInterests: false,
      },
    });
    await expect(instance.getFeedSignals('closed-user')).resolves.toBeNull();
    await expect(instance.getFeedSignals('missing-user')).resolves.toBeNull();
  });

  it('batches feed attribution and masks private profile identity', async () => {
    const profileStore = store();
    const academicService = academic();
    const publicRow = profile({
      userId: 'user-public',
      displayName: 'Pública',
      avatarUrl: 'https://example.test/public.png',
    });
    const privateRow = profile({
      id: '22222222-2222-4222-8222-222222222222',
      userId: 'user-private',
      displayName: 'Privada',
      avatarUrl: 'https://example.test/private.png',
      visibility: {
        ...profile().visibility,
        about: 'private',
      },
    });
    const closedRow = profile({
      id: '33333333-3333-4333-8333-333333333333',
      userId: 'user-closed',
      lifecycleState: 'closed',
      displayName: 'Closed Identity',
      avatarUrl: 'https://example.test/closed.png',
    });
    profileStore.findProfilesByUserIds.mockResolvedValue([
      publicRow,
      privateRow,
      closedRow,
    ]);

    const result = await service(
      profileStore,
      academicService,
    ).getAttributionsForUsers([
      'user-public',
      'user-private',
      'user-closed',
      'user-public',
    ]);

    expect(profileStore.findProfilesByUserIds.mock.calls).toEqual([
      [['user-public', 'user-private', 'user-closed']],
    ]);
    expect(result.get('user-public')).toEqual({
      profileId: publicRow.id,
      displayName: 'Pública',
      avatarUrl: 'https://example.test/public.png',
    });
    expect(result.get('user-private')).toEqual({
      profileId: privateRow.id,
      displayName: 'Usuario de Los Apuntes',
      avatarUrl: null,
    });
    expect(result.get('user-closed')).toEqual({
      profileId: closedRow.id,
      displayName: 'Usuario de Los Apuntes',
      avatarUrl: null,
    });
  });
});
