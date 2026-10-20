import { MongoQaStore } from './mongo-qa.store';
import { QuestionSchema } from './qa.mongo-schemas';

const subjectId = '11111111-1111-4111-8111-111111111111';
const questionId = '22222222-2222-4222-8222-222222222222';
const updatedAt = new Date('2026-10-19T18:00:00.000Z');

function setup(rows: unknown[]) {
  const query = {
    sort: jest.fn(),
    limit: jest.fn(),
    lean: jest.fn(),
    exec: jest.fn().mockResolvedValue(rows),
  };
  query.sort.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.lean.mockReturnValue(query);
  const questions = { find: jest.fn().mockReturnValue(query) };
  const store = new MongoQaStore(
    {} as never,
    questions as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { store, questions, query };
}

describe('B145 Mongo authored question index', () => {
  it('enforces author and available moderation before bounded pagination', async () => {
    const first = { id: questionId, updatedAt };
    const { store, questions, query } = setup([first, first]);
    await expect(
      store.searchQuestions({
        authorUserId: 'owner-a',
        subjectId,
        state: 'open',
        limit: 1,
        after: { id: questionId, updatedAt },
      }),
    ).resolves.toEqual({ items: [first], hasMore: true });

    expect(questions.find).toHaveBeenCalledWith({
      $and: [
        { moderationState: 'available' },
        { authorUserId: 'owner-a' },
        { subjectId },
        { state: 'open' },
        {
          $or: [
            { updatedAt: { $lt: updatedAt } },
            { updatedAt, id: { $gt: questionId } },
          ],
        },
      ],
    });
    expect(query.sort).toHaveBeenCalledWith({ updatedAt: -1, id: 1 });
    expect(query.limit).toHaveBeenCalledWith(2);
  });

  it('keeps public search semantics unchanged when author is not provided', async () => {
    const { store, questions } = setup([]);
    await expect(
      store.searchQuestions({ limit: 25 }),
    ).resolves.toEqual({ items: [], hasMore: false });
    expect(questions.find).toHaveBeenCalledWith({
      $and: [{ moderationState: 'available' }],
    });
  });

  it('adds an owner+moderation+stable-order index', () => {
    expect(QuestionSchema.indexes()).toEqual(
      expect.arrayContaining([
        [
          {
            authorUserId: 1,
            moderationState: 1,
            updatedAt: -1,
            id: 1,
          },
          {},
        ],
      ]),
    );
  });
});
