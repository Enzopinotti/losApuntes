import { MongoQaStore } from './mongo-qa.store';

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

describe('MongoQaStore Answer pagination', () => {
  it('uses limit+1 and returns honest overflow metadata', async () => {
    const rows = Array.from({ length: 4 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      questionId: '11111111-1111-4111-8111-111111111111',
      authorUserId: 'user-1',
      body: `Answer ${index}`,
      moderationState: 'available',
      revision: 1,
      createdAt: new Date(`2026-09-23T1${index}:00:00.000Z`),
      updatedAt: new Date(`2026-09-23T1${index}:00:00.000Z`),
    }));
    const chain = query(rows);
    const answers = { find: jest.fn().mockReturnValue(chain) };
    const store = new MongoQaStore(
      {} as never,
      {} as never,
      answers as never,
      {} as never,
      {} as never,
    );

    const result = await store.listAnswers({
      questionId: '11111111-1111-4111-8111-111111111111',
      limit: 3,
    });

    expect(answers.find).toHaveBeenCalledWith({
      $and: [
        {
          questionId: '11111111-1111-4111-8111-111111111111',
          moderationState: 'available',
        },
      ],
    });
    expect(chain.sort).toHaveBeenCalledWith({ createdAt: 1, id: 1 });
    expect(chain.limit).toHaveBeenCalledWith(4);
    expect(result.items).toHaveLength(3);
    expect(result.hasMore).toBe(true);
  });

  it('does not report overflow at exactly the page budget', async () => {
    const rows = Array.from({ length: 3 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      questionId: '11111111-1111-4111-8111-111111111111',
      authorUserId: 'user-1',
      body: `Answer ${index}`,
      moderationState: 'available',
      revision: 1,
      createdAt: new Date('2026-09-23T15:00:00.000Z'),
      updatedAt: new Date('2026-09-23T15:00:00.000Z'),
    }));
    const chain = query(rows);
    const answers = { find: jest.fn().mockReturnValue(chain) };
    const store = new MongoQaStore(
      {} as never,
      {} as never,
      answers as never,
      {} as never,
      {} as never,
    );

    const result = await store.listAnswers({
      questionId: '11111111-1111-4111-8111-111111111111',
      limit: 3,
    });

    expect(result.items).toHaveLength(3);
    expect(result.hasMore).toBe(false);
  });

  it('applies the createdAt/id continuation predicate before limiting', async () => {
    const chain = query([]);
    const answers = { find: jest.fn().mockReturnValue(chain) };
    const store = new MongoQaStore(
      {} as never,
      {} as never,
      answers as never,
      {} as never,
      {} as never,
    );
    const createdAt = new Date('2026-09-23T15:00:00.000Z');

    await store.listAnswers({
      questionId: '11111111-1111-4111-8111-111111111111',
      limit: 25,
      after: {
        createdAt,
        id: '22222222-2222-4222-8222-222222222222',
      },
    });

    expect(answers.find).toHaveBeenCalledWith({
      $and: [
        {
          questionId: '11111111-1111-4111-8111-111111111111',
          moderationState: 'available',
        },
        {
          $or: [
            { createdAt: { $gt: createdAt } },
            {
              createdAt,
              id: { $gt: '22222222-2222-4222-8222-222222222222' },
            },
          ],
        },
      ],
    });
    expect(chain.limit).toHaveBeenCalledWith(26);
  });
});
