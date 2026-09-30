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
    const store = new MongoProfileStore({} as never, activities as never);

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
    const store = new MongoProfileStore({} as never, activities as never);

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
    const store = new MongoProfileStore({} as never, activities as never);
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
