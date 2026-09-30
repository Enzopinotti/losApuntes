import type { ProfileActivityRecord } from '../domain/profile.types';
import { MongoProfileStore } from './mongo-profile.store';

const now = new Date('2026-09-30T12:00:00.000Z');

function activity(index: number): ProfileActivityRecord {
  return {
    id: `activity-${index}`,
    userId: 'user-1',
    type: 'project',
    title: `Activity ${index}`,
    description: null,
    url: null,
    startedOn: null,
    endedOn: null,
    revision: 1,
    createdAt: now,
    updatedAt: new Date(now.getTime() - index * 1_000),
  };
}

function query(rows: ProfileActivityRecord[]) {
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

describe('MongoProfileStore bounded activity inventory', () => {
  it('uses limit+1 and returns only the visible activity budget', async () => {
    const rows = Array.from({ length: 4 }, (_, index) => activity(index));
    const chain = query(rows);
    const activities = {
      find: jest.fn().mockReturnValue(chain),
    };
    const store = new MongoProfileStore({} as never, activities as never);

    const result = await store.listActivitiesForUser('user-1', 3);

    expect(activities.find).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(chain.sort).toHaveBeenCalledWith({ updatedAt: -1, id: 1 });
    expect(chain.limit).toHaveBeenCalledWith(4);
    expect(result.items).toHaveLength(3);
    expect(result.items.map((row) => row.id)).toEqual([
      'activity-0',
      'activity-1',
      'activity-2',
    ]);
    expect(result.hasMore).toBe(true);
  });

  it('does not report truncation at exactly the activity budget', async () => {
    const rows = Array.from({ length: 3 }, (_, index) => activity(index));
    const chain = query(rows);
    const activities = {
      find: jest.fn().mockReturnValue(chain),
    };
    const store = new MongoProfileStore({} as never, activities as never);

    const result = await store.listActivitiesForUser('user-1', 3);

    expect(result.items).toHaveLength(3);
    expect(result.hasMore).toBe(false);
  });
});
