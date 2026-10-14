import type { Connection, Model } from 'mongoose';

import type { FeedFeedback, FeedPreferences } from './feed.mongo-schemas';
import { FeedFeedbackSchema } from './feed.mongo-schemas';
import { MongoFeedStore } from './mongo-feed.store';

function queryFor(result: unknown) {
  const query = {
    select: jest.fn(),
    sort: jest.fn(),
    limit: jest.fn(),
    lean: jest.fn(),
    exec: jest.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.sort.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.lean.mockReturnValue(query);
  return query;
}

describe('MongoFeedStore account export reads', () => {
  it('reads persisted preferences with an owner filter and portable projection', async () => {
    const row = {
      useAcademic: true,
      useSocial: false,
      useInterests: true,
      mutedSubjectIds: ['subject-ref'],
      mutedProfileIds: ['profile-ref'],
      prioritizedSubjectIds: [],
      createdAt: new Date('2026-10-11T10:00:00.000Z'),
      updatedAt: new Date('2026-10-11T11:00:00.000Z'),
    };
    const preferencesQuery = queryFor(row);
    const findOne = jest.fn().mockReturnValue(preferencesQuery);
    const findOneAndUpdate = jest.fn();
    const preferences = {
      findOne,
      findOneAndUpdate,
    } as unknown as Model<FeedPreferences>;
    const feedback = {} as Model<FeedFeedback>;
    const store = new MongoFeedStore({} as Connection, preferences, feedback);

    await expect(store.findPreferencesForExport('owner-user')).resolves.toBe(
      row,
    );

    expect(findOne.mock.calls).toEqual([[{ userId: 'owner-user' }]]);
    expect(preferencesQuery.select).toHaveBeenCalledWith({
      _id: 0,
      useAcademic: 1,
      useSocial: 1,
      useInterests: 1,
      mutedSubjectIds: 1,
      mutedProfileIds: 1,
      prioritizedSubjectIds: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    expect(findOneAndUpdate.mock.calls).toHaveLength(0);
  });

  it('uses owner-scoped keyset pages, field allowlisting and the export order', async () => {
    const rows = [
      {
        targetType: 'question',
        targetId: 'question-3',
        signal: 'more',
        createdAt: new Date('2026-10-10T10:00:00.000Z'),
        updatedAt: new Date('2026-10-11T11:00:00.000Z'),
      },
    ];
    const feedbackQuery = queryFor(rows);
    const findFeedback = jest.fn().mockReturnValue(feedbackQuery);
    const feedback = {
      find: findFeedback,
    } as unknown as Model<FeedFeedback>;
    const preferences = {} as Model<FeedPreferences>;
    const store = new MongoFeedStore({} as Connection, preferences, feedback);
    await expect(
      store.listFeedbackForExport(
        'owner-user',
        { targetType: 'resource', targetId: 'resource-2' },
        101,
      ),
    ).resolves.toBe(rows);

    expect(findFeedback.mock.calls).toEqual([
      [
        {
          userId: 'owner-user',
          $or: [
            { targetType: { $gt: 'resource' } },
            { targetType: 'resource', targetId: { $gt: 'resource-2' } },
          ],
        },
      ],
    ]);
    expect(feedbackQuery.select).toHaveBeenCalledWith({
      _id: 0,
      targetType: 1,
      targetId: 1,
      signal: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    expect(feedbackQuery.sort).toHaveBeenCalledWith({
      targetType: 1,
      targetId: 1,
    });
    expect(feedbackQuery.limit).toHaveBeenCalledWith(101);
  });

  it('reuses the existing unique owner and target index for feedback pages', () => {
    expect(FeedFeedbackSchema.indexes()).toContainEqual([
      { userId: 1, targetType: 1, targetId: 1 },
      { background: true, unique: true },
    ]);
  });
});
