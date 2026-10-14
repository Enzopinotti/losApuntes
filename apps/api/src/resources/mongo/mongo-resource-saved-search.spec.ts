import { MongoResourceStore, savedMetadataRegex } from './mongo-resource.store';

describe('Mongo saved-library full-collection search', () => {
  function build(result: Array<{ resourceId: string; createdAt: Date }> = []) {
    const exec = jest.fn().mockResolvedValue(result);
    const aggregate = jest.fn().mockReturnValue({ exec });
    const store = new MongoResourceStore(
      {} as never,
      {} as never,
      {} as never,
      { aggregate } as never,
      {} as never,
      {} as never,
    );
    return { store, aggregate };
  }

  it('applies owner, save cursor, metadata, moderation and ACL before limiting', async () => {
    const { store, aggregate } = build();
    const after = {
      createdAt: new Date('2026-10-14T12:00:00.000Z'),
      resourceId: '11111111-1111-4111-8111-111111111111',
    };
    await store.searchSavedResources({
      userId: 'owner-1',
      q: 'resumen sql',
      limit: 25,
      after,
    });

    const stages = aggregate.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(stages[0]).toEqual({
      $match: {
        userId: 'owner-1',
        $or: [
          { createdAt: { $lt: after.createdAt } },
          { createdAt: after.createdAt, resourceId: { $gt: after.resourceId } },
        ],
      },
    });
    expect(stages[1]).toEqual({ $sort: { createdAt: -1, resourceId: 1 } });
    const json = JSON.stringify(stages);
    expect(json).toContain('"from":"resources"');
    expect(json).toContain('"moderationState":"available"');
    expect(json).toContain('"from":"resource_shares"');
    expect(json).toContain('"$eq":["$id","$savedResourceId"]');
    expect(json).toContain('"$eq":["$resourceId","$savedResourceId"]');
    expect(json).toContain('"__resource.visibility":"shared"');
    expect(json).toContain('"__resource.authorUserId":"owner-1"');
    expect(json).toContain('"__viewerShares.0"');
    const limit = stages.findIndex((stage) => '$limit' in stage);
    const authorization = stages.findIndex((stage) => '$match' in stage &&
      JSON.stringify(stage).includes('__resource.visibility'));
    expect(authorization).toBeGreaterThan(0);
    expect(limit).toBeGreaterThan(authorization);
    expect(stages[limit]).toEqual({ $limit: 26 });
    expect(stages.at(-1)).toEqual({
      $project: { _id: 0, resourceId: 1, createdAt: 1 },
    });
  });

  it('filters by Subject inside the joined Resource before the page limit', async () => {
    const { store, aggregate } = build();
    await store.searchSavedResources({
      userId: 'owner-1',
      subjectId: '11111111-1111-4111-8111-111111111111',
      limit: 25,
    });
    const stages = aggregate.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    const text = JSON.stringify(stages);
    expect(text).toContain('"subjectId":"11111111-1111-4111-8111-111111111111"');
    expect(text).not.toContain('"$regex"');
    const auth = stages.findIndex((stage) => JSON.stringify(stage).includes('__resource.visibility'));
    const limit = stages.findIndex((stage) => '$limit' in stage);
    expect(limit).toBeGreaterThan(auth);
  });

  it('aggregates global facet counts only after Resource visibility checks', async () => {
    const { store, aggregate } = build([
      { resourceId: '11111111-1111-4111-8111-111111111111', createdAt: new Date() },
    ]);
    await store.listSavedSubjectFacets('owner-1');
    const stages = aggregate.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    const text = JSON.stringify(stages);
    expect(stages[0]).toEqual({ $match: { userId: 'owner-1' } });
    expect(text).toContain('"from":"resources"');
    expect(text).toContain('"from":"resource_shares"');
    expect(text).toContain('"moderationState":"available"');
    expect(text).toContain('"$eq":["$id","$resourceId"]');
    expect(text).toContain('"$eq":["$resourceId","$resourceId"]');
    const authorized = stages.findIndex((stage) => JSON.stringify(stage).includes('__resource.visibility'));
    const group = stages.findIndex((stage) => '$group' in stage);
    expect(group).toBeGreaterThan(authorized);
    expect(stages).toContainEqual({ $limit: 101 });
  });

  it('returns only a bounded page and signals more after filtering', async () => {
    const now = new Date('2026-10-14T12:00:00.000Z');
    const rows = ['one', 'two', 'three'].map((resourceId) => ({
      resourceId, createdAt: now,
    }));
    const { store } = build(rows);
    const page = await store.searchSavedResources({
      userId: 'owner-1',
      q: 'sql',
      limit: 2,
    });
    expect(page).toEqual({ items: rows.slice(0, 2), hasMore: true });
  });

  it('escapes operator input and handles Spanish accent variants without interpolating regex', () => {
    expect(savedMetadataRegex('c++ (sql)')).toBe('c\\+\\+ \\(sql\\)');
    expect(new RegExp(savedMetadataRegex('algebra'), 'i').test('álgebra')).toBe(true);
    expect(new RegExp(savedMetadataRegex('matemática'), 'i').test('matematica')).toBe(true);
    expect(new RegExp(savedMetadataRegex('sql.*'), 'i').test('sqlXYZ')).toBe(false);
  });
});
