import type { CreateProfileRecord } from '../../profile/domain/profile.store';
import { ProfileAccountInactiveError } from '../../profile/domain/profile.store';
import { MongoProfileStore } from '../../profile/mongo/mongo-profile.store';
import type { ProfileRecord } from '../../profile/domain/profile.types';
import { MongoAccountLifecycleStore } from './mongo-account-lifecycle.store';

const now = new Date('2026-10-03T12:00:00.000Z');
const userId = '507f1f77bcf86cd799439011';

const profileInput: CreateProfileRecord = {
  id: 'profile-1',
  userId,
  displayName: 'Enzo',
  bio: null,
  avatarUrl: null,
  languages: [],
  skills: [],
  interests: [],
  helpTopics: [],
  learningTopics: [],
  professional: { headline: null, careerDiscoveryOptIn: false },
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
};

function transactionQuery<T>(resolve: () => T | Promise<T>) {
  const chain = {
    session: jest.fn(),
    lean: jest.fn(),
    exec: jest.fn().mockImplementation(resolve),
  };
  chain.session.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);
  return chain;
}

function fixture() {
  const state: {
    user: {
      _id: string;
      account_status: 'active' | 'closed';
      credential_version: number;
      account_lifecycle_revision: number;
    };
    profile: ProfileRecord | null;
  } = {
    user: {
      _id: userId,
      account_status: 'active',
      credential_version: 1,
      account_lifecycle_revision: 0,
    },
    profile: null,
  };

  const connection = {
    startSession: jest.fn().mockResolvedValue({
      withTransaction: jest.fn(async (callback: () => Promise<void>) =>
        callback(),
      ),
      endSession: jest.fn().mockResolvedValue(undefined),
    }),
  };
  const users = {
    findOneAndUpdate: jest.fn(
      (_filter: unknown, update: Record<string, unknown>) =>
        transactionQuery(() => {
          if (state.user.account_status !== 'active') return null;
          const previous = { ...state.user };
          if ('$inc' in update) {
            state.user.account_lifecycle_revision += 1;
          }
          const set = update.$set as Record<string, unknown> | undefined;
          if (set?.account_status === 'closed') {
            state.user.account_status = 'closed';
            state.user.credential_version += 1;
          }
          return previous;
        }),
    ),
  };
  const profiles = {
    create: jest.fn((documents: CreateProfileRecord[]) => {
      state.profile = {
        ...documents[0],
        lifecycleState: 'active',
        createdAt: now,
        updatedAt: now,
      };
      return [state.profile];
    }),
    updateOne: jest.fn((_filter: unknown, update: Record<string, unknown>) =>
      transactionQuery(() => {
        if (!state.profile) return { modifiedCount: 0 };
        const set = update.$set as Record<string, unknown> | undefined;
        if (set?.lifecycleState === 'closed') {
          state.profile.lifecycleState = 'closed';
          state.profile.revision += 1;
        }
        return { modifiedCount: 1 };
      }),
    ),
  };
  const managers = {
    findOne: jest.fn(() => transactionQuery(() => null)),
  };
  const jobs = {
    updateOne: jest.fn(() => transactionQuery(() => ({ modifiedCount: 1 }))),
  };
  const audits = { create: jest.fn().mockResolvedValue([]) };

  return {
    state,
    profileStore: new MongoProfileStore(
      profiles as never,
      {} as never,
      connection as never,
      users as never,
    ),
    lifecycleStore: new MongoAccountLifecycleStore(
      connection as never,
      users as never,
      profiles as never,
      managers as never,
      jobs as never,
      audits as never,
    ),
    profiles,
  };
}

describe('account closure and first Profile creation serialization', () => {
  it('tombstones the Profile when Profile creation wins the User write first', async () => {
    const f = fixture();

    await f.profileStore.createProfile(profileInput);
    await f.lifecycleStore.closeAccount({
      userId,
      expectedCredentialVersion: 1,
      now,
      auditId: 'audit-1',
      cleanupJobId: 'job-1',
    });

    expect(f.state.user.account_status).toBe('closed');
    expect(f.state.profile?.lifecycleState).toBe('closed');
    expect(f.state.profile?.revision).toBe(2);
  });

  it('rejects first Profile creation when closure wins the User write first', async () => {
    const f = fixture();

    await f.lifecycleStore.closeAccount({
      userId,
      expectedCredentialVersion: 1,
      now,
      auditId: 'audit-1',
      cleanupJobId: 'job-1',
    });

    await expect(
      f.profileStore.createProfile(profileInput),
    ).rejects.toBeInstanceOf(ProfileAccountInactiveError);
    expect(f.state.user.account_status).toBe('closed');
    expect(f.state.profile).toBeNull();
    expect(f.profiles.create).not.toHaveBeenCalled();
  });
});
