import type { ProfileService } from '../../profile/domain/profile.service';
import type { UsersService } from '../../users/users.service';
import {
  AccountIdentityExportContributor,
  ProfileActivitiesExportContributor,
  ProfileExportContributor,
} from './account-export-core.contributors';

describe('core account export contributors', () => {
  it('exports the account allowlist as one cursorless section', async () => {
    const users = {
      getAccountExportProjection: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'enzo@example.com',
        username: null,
        emailVerifiedAt: null,
        accountStatus: 'active',
        accountClosedAt: null,
        fullName: 'Enzo',
        avatarUrl: null,
        bio: null,
        careerId: null,
        cohortYear: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      }),
    } as unknown as jest.Mocked<UsersService>;

    const contributor = new AccountIdentityExportContributor(users);

    await expect(
      contributor.readPage({
        userId: 'user-1',
        cursor: null,
        limit: 100,
      }),
    ).resolves.toEqual({
      records: [
        {
          id: 'user-1',
          email: 'enzo@example.com',
          username: null,
          emailVerifiedAt: null,
          accountStatus: 'active',
          accountClosedAt: null,
          fullName: 'Enzo',
          avatarUrl: null,
          bio: null,
          careerId: null,
          cohortYear: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
      nextCursor: null,
    });

    await expect(
      contributor.readPage({
        userId: 'user-1',
        cursor: 'unexpected',
        limit: 100,
      }),
    ).rejects.toThrow('does not accept a cursor');
  });

  it('fails closed when the export owner record is missing', async () => {
    const users = {
      getAccountExportProjection: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<UsersService>;

    await expect(
      new AccountIdentityExportContributor(users).readPage({
        userId: 'missing',
        cursor: null,
        limit: 100,
      }),
    ).rejects.toThrow('Account export owner record is missing');
  });

  it('keeps missing optional Profile as an empty singleton section', async () => {
    const profiles = {
      getAccountExportProfile: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<ProfileService>;

    await expect(
      new ProfileExportContributor(profiles).readPage({
        userId: 'missing-profile',
        cursor: null,
        limit: 100,
      }),
    ).resolves.toEqual({ records: [], nextCursor: null });
  });

  it('exports private owner profile controls without applying public visibility', async () => {
    const profiles = {
      getAccountExportProfile: jest.fn().mockResolvedValue({
        lifecycleState: 'active',
        id: 'profile-1',
        displayName: 'Enzo',
        bio: 'Private bio',
        avatarUrl: null,
        languages: ['es'],
        skills: ['SQL'],
        interests: ['data'],
        helpTopics: ['db'],
        learningTopics: ['architecture'],
        professional: {
          headline: 'Private headline',
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
        revision: 3,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      }),
    } as unknown as jest.Mocked<ProfileService>;

    const result = await new ProfileExportContributor(profiles).readPage({
      userId: 'user-1',
      cursor: null,
      limit: 100,
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      bio: 'Private bio',
      professional: {
        headline: 'Private headline',
        careerDiscoveryOptIn: true,
      },
      visibility: {
        about: 'private',
      },
      recommendationSignals: {
        academicContext: false,
      },
    });
  });

  it('delegates profile activity pagination without widening the caller budget', async () => {
    const profiles = {
      listAccountExportActivities: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'activity-1',
            type: 'project',
            title: 'Proyecto',
            description: null,
            url: null,
            startedOn: '2026-01',
            endedOn: null,
            revision: 1,
            createdAt: '2026-09-01T00:00:00.000Z',
            updatedAt: '2026-09-01T00:00:00.000Z',
          },
        ],
        nextCursor: 'next',
      }),
    } as unknown as jest.Mocked<ProfileService>;

    const contributor = new ProfileActivitiesExportContributor(profiles);

    await expect(
      contributor.readPage({
        userId: 'user-1',
        cursor: 'cursor',
        limit: 100,
      }),
    ).resolves.toEqual({
      records: [
        {
          id: 'activity-1',
          type: 'project',
          title: 'Proyecto',
          description: null,
          url: null,
          startedOn: '2026-01',
          endedOn: null,
          revision: 1,
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
      nextCursor: 'next',
    });

    expect(profiles.listAccountExportActivities.mock.calls).toEqual([
      [
        'user-1',
        {
          limit: 100,
          cursor: 'cursor',
        },
      ],
    ]);
  });
});
