import { MongoAcademicStore } from './mongo-academic.store';

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

function store(input: {
  affiliations?: ReturnType<typeof query>;
  participations?: ReturnType<typeof query>;
  follows?: ReturnType<typeof query>;
}) {
  const affiliations = {
    find: jest.fn().mockReturnValue(input.affiliations),
  };
  const participations = {
    find: jest.fn().mockReturnValue(input.participations),
  };
  const follows = {
    find: jest.fn().mockReturnValue(input.follows),
  };

  return {
    store: new MongoAcademicStore(
      {} as never,
      {} as never,
      affiliations as never,
      participations as never,
      {} as never,
      follows as never,
      {} as never,
      {} as never,
    ),
    affiliations,
    participations,
    follows,
  };
}

describe('MongoAcademicStore bounded user inventories', () => {
  it('uses limit+1 for affiliation inventory and exposes overflow honestly', async () => {
    const rows = Array.from({ length: 4 }, (_, index) => ({
      id: `affiliation-${index}`,
      userId: 'user-1',
      institutionId: 'institution-1',
      status: 'active',
      roles: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const chain = query(rows);
    const fixture = store({ affiliations: chain });

    const result = await fixture.store.listAffiliationsForUser({
      userId: 'user-1',
      statuses: ['active', 'paused'],
      limit: 3,
    });

    expect(fixture.affiliations.find).toHaveBeenCalledWith({
      userId: 'user-1',
      status: { $in: ['active', 'paused'] },
    });
    expect(chain.sort).toHaveBeenCalledWith({ updatedAt: -1, id: 1 });
    expect(chain.limit).toHaveBeenCalledWith(4);
    expect(result.items).toHaveLength(3);
    expect(result.hasMore).toBe(true);
  });

  it('does not report affiliation overflow at exactly the budget', async () => {
    const rows = Array.from({ length: 3 }, (_, index) => ({
      id: `affiliation-${index}`,
      userId: 'user-1',
      institutionId: 'institution-1',
      status: 'active',
      roles: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const chain = query(rows);
    const fixture = store({ affiliations: chain });

    const result = await fixture.store.listAffiliationsForUser({
      userId: 'user-1',
      limit: 3,
    });

    expect(fixture.affiliations.find).toHaveBeenCalledWith({
      userId: 'user-1',
    });
    expect(result.items).toHaveLength(3);
    expect(result.hasMore).toBe(false);
  });

  it('bounds current-subject decision snapshots before returning them', async () => {
    const rows = Array.from({ length: 3 }, (_, index) => ({
      id: `participation-${index}`,
      userId: 'user-1',
      subjectId: `subject-${index}`,
      state: 'current',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const chain = query(rows);
    const fixture = store({ participations: chain });

    const result = await fixture.store.listSubjectParticipationsForUser({
      userId: 'user-1',
      states: ['current'],
      limit: 2,
    });

    expect(fixture.participations.find).toHaveBeenCalledWith({
      userId: 'user-1',
      state: { $in: ['current'] },
    });
    expect(chain.limit).toHaveBeenCalledWith(3);
    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(true);
  });

  it('bounds academic follows and keeps stable ordering', async () => {
    const rows = Array.from({ length: 3 }, (_, index) => ({
      id: `follow-${index}`,
      userId: 'user-1',
      targetNodeId: `target-${index}`,
      targetKind: 'institution',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const chain = query(rows);
    const fixture = store({ follows: chain });

    const result = await fixture.store.listAcademicFollows('user-1', 2);

    expect(fixture.follows.find).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(chain.sort).toHaveBeenCalledWith({ updatedAt: -1, id: 1 });
    expect(chain.limit).toHaveBeenCalledWith(3);
    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(true);
  });
});

describe('MongoAcademicStore bounded redirect fan-out', () => {
  it('uses one limit+1 query for all frontier targets', async () => {
    const rows = Array.from({ length: 4 }, (_, index) => ({
      id: `redirect-${index}`,
      status: 'merged',
      redirectToId: index % 2 === 0 ? 'target-a' : 'target-b',
    }));
    const chain = query(rows);
    const catalog = { find: jest.fn().mockReturnValue(chain) };
    const store = new MongoAcademicStore(
      {} as never,
      catalog as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await store.findDirectRedirectSources(
      ['target-a', 'target-b'],
      3,
    );

    expect(catalog.find).toHaveBeenCalledWith({
      status: 'merged',
      redirectToId: { $in: ['target-a', 'target-b'] },
    });
    expect(chain.sort).toHaveBeenCalledWith({ id: 1 });
    expect(chain.limit).toHaveBeenCalledWith(4);
    expect(result.items).toHaveLength(3);
    expect(result.hasMore).toBe(true);
  });

  it('short-circuits an empty redirect frontier without querying Mongo', async () => {
    const catalog = { find: jest.fn() };
    const store = new MongoAcademicStore(
      {} as never,
      catalog as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      store.findDirectRedirectSources([], 10),
    ).resolves.toEqual({
      items: [],
      hasMore: false,
    });
    expect(catalog.find).not.toHaveBeenCalled();
  });
});
