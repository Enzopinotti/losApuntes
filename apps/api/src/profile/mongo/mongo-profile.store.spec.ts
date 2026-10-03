import {
  ProfileAccountInactiveError,
  type CreateProfileRecord,
} from '../domain/profile.store';
import { MongoProfileStore } from './mongo-profile.store';

function query<T>(rows: T[]) {
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

function storeForReads(profiles: unknown, activities: unknown) {
  return new MongoProfileStore(
    profiles as never,
    activities as never,
    {} as never,
    {} as never,
  );
}

function createFixture(user: unknown = { _id: 'user-1' }) {
  const session = {
    withTransaction: jest.fn(async (callback: () => Promise<void>) =>
      callback(),
    ),
    endSession: jest.fn().mockResolvedValue(undefined),
  };
  const connection = {
    startSession: jest.fn().mockResolvedValue(session),
  };
  const userQuery = {
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(user),
  };
  const users = {
    findOneAndUpdate: jest.fn(() => userQuery),
  };
  const created = { id: 'profile-1', userId: 'user-1' };
  const profiles = {
    create: jest.fn().mockResolvedValue([created]),
  };
  const store = new MongoProfileStore(
    profiles as never,
    {} as never,
    connection as never,
    users as never,
  );

  return { store, profiles, users, session, created };
}

describe('MongoProfileStore activity pagination', () => {
  it('uses limit+1 and returns an honest max+1 sentinel', async () => {
    const rows = Array.from({ length: 4 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      userId: 'user-1',
      type: 'project',
      title: `Activity ${index}`,
      description: null,
      url: null,
      startedOn: null,
      endedOn: null,
      revision: 1,
      createdAt: new Date(`2026-09-2${3 - index}T03:00:00.000Z`),
      updatedAt: new Date(`2026-09-2${3 - index}T03:00:00.000Z`),
    }));
    const chain = query(rows);
    const activities = { find: jest.fn().mockReturnValue(chain) };
    const store = storeForReads({}, activities);

    const result = await store.listActivitiesForUser({
      userId: 'user-1',
      limit: 3,
    });

    expect(activities.find).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1, id: 1 });
    expect(chain.limit).toHaveBeenCalledWith(4);
    expect(result.items).toHaveLength(3);
    expect(result.hasMore).toBe(true);
  });

  it('does not report overflow at exactly the page budget', async () => {
    const rows = Array.from({ length: 3 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      userId: 'user-1',
      type: 'project',
      title: `Activity ${index}`,
      description: null,
      url: null,
      startedOn: null,
      endedOn: null,
      revision: 1,
      createdAt: new Date('2026-09-23T03:00:00.000Z'),
      updatedAt: new Date('2026-09-23T03:00:00.000Z'),
    }));
    const chain = query(rows);
    const activities = { find: jest.fn().mockReturnValue(chain) };
    const store = storeForReads({}, activities);

    const result = await store.listActivitiesForUser({
      userId: 'user-1',
      limit: 3,
    });

    expect(result.items).toHaveLength(3);
    expect(result.hasMore).toBe(false);
  });

  it('applies the createdAt/id continuation predicate before the limit', async () => {
    const chain = query([]);
    const activities = { find: jest.fn().mockReturnValue(chain) };
    const store = storeForReads({}, activities);
    const createdAt = new Date('2026-09-23T03:00:00.000Z');

    await store.listActivitiesForUser({
      userId: 'user-1',
      limit: 20,
      after: {
        createdAt,
        id: '22222222-2222-4222-8222-222222222222',
      },
    });

    expect(activities.find).toHaveBeenCalledWith({
      userId: 'user-1',
      $or: [
        { createdAt: { $lt: createdAt } },
        {
          createdAt,
          id: { $gt: '22222222-2222-4222-8222-222222222222' },
        },
      ],
    });
    expect(chain.limit).toHaveBeenCalledWith(21);
  });
});

describe('MongoProfileStore account lifecycle fence', () => {
  const input = {
    id: 'profile-1',
    userId: 'user-1',
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
  } satisfies CreateProfileRecord;

  it('fences the active User in the same transaction before inserting a Profile', async () => {
    const f = createFixture();

    await expect(f.store.createProfile(input)).resolves.toEqual(f.created);

    expect(f.users.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: input.userId,
        $or: [
          { account_status: 'active' },
          { account_status: { $exists: false } },
        ],
      },
      { $inc: { account_lifecycle_revision: 1 } },
      { new: false, session: f.session },
    );
    expect(f.profiles.create).toHaveBeenCalledWith([input], {
      session: f.session,
    });
    expect(f.session.withTransaction).toHaveBeenCalledTimes(1);
    expect(f.session.endSession).toHaveBeenCalledTimes(1);
  });

  it('does not insert an active Profile when closure has already won the User write', async () => {
    const f = createFixture(null);

    await expect(f.store.createProfile(input)).rejects.toBeInstanceOf(
      ProfileAccountInactiveError,
    );

    expect(f.users.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(f.profiles.create).not.toHaveBeenCalled();
    expect(f.session.endSession).toHaveBeenCalledTimes(1);
  });
});
