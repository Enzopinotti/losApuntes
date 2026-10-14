import {
  MongoResourceStore,
  SAVED_LIBRARY_AGGREGATION_TIMEOUT_MS,
  savedMetadataRegex,
} from './mongo-resource.store';

describe('Mongo saved-library full-collection search', () => {
  function build(
    result: Array<{ resourceId: string; createdAt: Date; title?: string }> = [],
  ) {
    const exec = jest.fn().mockResolvedValue(result);
    const collation = jest.fn().mockReturnValue({ exec });
    const option = jest.fn().mockReturnValue({ exec, collation });
    const aggregate = jest.fn().mockReturnValue({ exec, collation, option });
    const store = new MongoResourceStore(
      {} as never,
      {} as never,
      {} as never,
      { aggregate } as never,
      {} as never,
      {} as never,
    );
    return { store, aggregate, collation, option };
  }

  it('checks saved-date continuation against an existing authorized bookmark', async () => {
    const { store, aggregate, option, collation } = build([
      {
        resourceId: '11111111-1111-4111-8111-111111111111',
        createdAt: new Date(),
      },
    ]);
    const anchor = {
      resourceId: '11111111-1111-4111-8111-111111111111',
      createdAt: new Date('2026-10-14T13:00:00.000Z'),
    };
    await expect(
      store.isSavedSearchAnchorCurrent({
        userId: 'viewer-a',
        q: 'algebra',
        after: anchor,
      }),
    ).resolves.toBe(true);

    const stages = (
      aggregate.mock.calls as unknown as Array<[Array<Record<string, unknown>>]>
    )[0]?.[0];
    expect(stages[0]).toEqual({
      $match: {
        userId: 'viewer-a',
        resourceId: anchor.resourceId,
        createdAt: anchor.createdAt,
      },
    });
    expect(stages[1]).toEqual({ $project: { _id: 0, resourceId: 1 } });
    expect(JSON.stringify(stages)).toContain('"searchText"');
    const authorizationIndex = stages.findIndex(
      (stage) =>
        '$match' in stage &&
        JSON.stringify(stage).includes('__resource.visibility'),
    );
    const limitIndex = stages.findIndex((stage) => '$limit' in stage);
    expect(authorizationIndex).toBeGreaterThan(0);
    expect(limitIndex).toBeGreaterThan(authorizationIndex);
    expect(stages[limitIndex]).toEqual({ $limit: 1 });
    expect(option).toHaveBeenCalledWith({
      maxTimeMS: SAVED_LIBRARY_AGGREGATION_TIMEOUT_MS,
    });
    expect(collation).not.toHaveBeenCalled();
  });

  it('checks a title anchor with the same collation and Subject as sorted paging', async () => {
    const { store, aggregate, collation } = build([
      {
        resourceId: '11111111-1111-4111-8111-111111111111',
        createdAt: new Date(),
      },
    ]);
    const subjectId = '22222222-2222-4222-8222-222222222222';
    await expect(
      store.isSavedSearchAnchorCurrent({
        userId: 'viewer-a',
        subjectId,
        titleAfter: {
          title: 'Álgebra',
          resourceId: '11111111-1111-4111-8111-111111111111',
        },
      }),
    ).resolves.toBe(true);
    expect(collation).toHaveBeenCalledWith({ locale: 'es', strength: 1 });
    const stages = (
      aggregate.mock.calls as unknown as Array<[Array<Record<string, unknown>>]>
    )[0]?.[0];
    const text = JSON.stringify(stages);
    expect(text).toContain(
      '"subjectId":"22222222-2222-4222-8222-222222222222"',
    );
    expect(text).toContain('"__resource.title":"Álgebra"');
    expect(text).toContain('"localField":"resourceId","foreignField":"id"');
    expect(text).toContain(
      '"localField":"resourceId","foreignField":"resourceId"',
    );
  });

  it('returns false for a removed or invisible anchor instead of inventing a next page', async () => {
    const { store } = build([]);
    expect(
      await store.isSavedSearchAnchorCurrent({
        userId: 'viewer-a',
        after: {
          resourceId: '11111111-1111-4111-8111-111111111111',
          createdAt: new Date('2026-10-14T13:00:00.000Z'),
        },
      }),
    ).toBe(false);
    expect(
      await store.isSavedSearchAnchorCurrent({
        userId: 'viewer-a',
      }),
    ).toBe(false);
  });

  it('sets a strict execution budget and spill allowance on title and date searches', async () => {
    const { store, option, collation } = build();
    await store.searchSavedResources({
      userId: 'viewer-a',
      order: 'title',
      limit: 25,
    });
    expect(option).toHaveBeenCalledWith({
      allowDiskUse: true,
      maxTimeMS: SAVED_LIBRARY_AGGREGATION_TIMEOUT_MS,
    });
    expect(collation).toHaveBeenCalledWith({ locale: 'es', strength: 1 });
    option.mockClear();
    collation.mockClear();
    await store.searchSavedResources({
      userId: 'viewer-a',
      q: 'álgebra',
      limit: 25,
    });
    expect(option).toHaveBeenCalledWith({
      allowDiskUse: true,
      maxTimeMS: SAVED_LIBRARY_AGGREGATION_TIMEOUT_MS,
    });
    expect(collation).not.toHaveBeenCalled();
    expect(SAVED_LIBRARY_AGGREGATION_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it('budgets the global Subject facet aggregation independently of title sorting', async () => {
    const { store, option } = build();
    await store.listSavedSubjectFacets('viewer-a');
    expect(option).toHaveBeenCalledWith({
      allowDiskUse: true,
      maxTimeMS: SAVED_LIBRARY_AGGREGATION_TIMEOUT_MS,
    });
  });

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

    const stages = (
      aggregate.mock.calls as unknown as Array<[Array<Record<string, unknown>>]>
    )[0]?.[0];
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
    expect(stages[2]).toEqual({
      $project: { _id: 0, resourceId: 1, createdAt: 1 },
    });
    const json = JSON.stringify(stages);
    expect(json).toContain('"from":"resources"');
    expect(json).toContain('"moderationState":"available"');
    expect(json).toContain('"from":"resource_shares"');
    expect(json).toContain('"localField":"resourceId","foreignField":"id"');
    expect(json).toContain(
      '"localField":"resourceId","foreignField":"resourceId"',
    );
    expect(json).toContain('"__resource.visibility":"shared"');
    expect(json).toContain('"__resource.authorUserId":"owner-1"');
    expect(json).toContain('"__viewerShares.0"');
    const limit = stages.findIndex((stage) => '$limit' in stage);
    const authorization = stages.findIndex(
      (stage) =>
        '$match' in stage &&
        JSON.stringify(stage).includes('__resource.visibility'),
    );
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
    const stages = (
      aggregate.mock.calls as unknown as Array<[Array<Record<string, unknown>>]>
    )[0]?.[0];
    const text = JSON.stringify(stages);
    expect(text).toContain(
      '"subjectId":"11111111-1111-4111-8111-111111111111"',
    );
    expect(text).not.toContain('"$regex"');
    const auth = stages.findIndex((stage) =>
      JSON.stringify(stage).includes('__resource.visibility'),
    );
    const limit = stages.findIndex((stage) => '$limit' in stage);
    expect(limit).toBeGreaterThan(auth);
  });

  it('aggregates global facet counts only after Resource visibility checks', async () => {
    const { store, aggregate } = build([
      {
        resourceId: '11111111-1111-4111-8111-111111111111',
        createdAt: new Date(),
      },
    ]);
    await store.listSavedSubjectFacets('owner-1');
    const stages = (
      aggregate.mock.calls as unknown as Array<[Array<Record<string, unknown>>]>
    )[0]?.[0];
    const text = JSON.stringify(stages);
    expect(stages[0]).toEqual({ $match: { userId: 'owner-1' } });
    expect(stages[1]).toEqual({ $project: { _id: 0, resourceId: 1 } });
    expect(text).toContain('"from":"resources"');
    expect(text).toContain('"from":"resource_shares"');
    expect(text).toContain('"moderationState":"available"');
    expect(text).toContain('"localField":"resourceId","foreignField":"id"');
    expect(text).toContain(
      '"localField":"resourceId","foreignField":"resourceId"',
    );
    const authorized = stages.findIndex((stage) =>
      JSON.stringify(stage).includes('__resource.visibility'),
    );
    const group = stages.findIndex((stage) => '$group' in stage);
    expect(group).toBeGreaterThan(authorized);
    expect(stages).toContainEqual({ $limit: 101 });
  });

  it('sorts the full authorized collection by title using Spanish collation and keyset paging', async () => {
    const { store, aggregate, collation } = build([
      {
        resourceId: '22222222-2222-4222-8222-222222222222',
        createdAt: new Date(),
        title: 'Álgebra',
      },
      {
        resourceId: '33333333-3333-4333-8333-333333333333',
        createdAt: new Date(),
        title: 'Álgebra',
      },
    ]);
    const after = {
      title: 'Álgebra',
      resourceId: '11111111-1111-4111-8111-111111111111',
    };
    const page = await store.searchSavedResources({
      userId: 'owner-1',
      order: 'title',
      limit: 1,
      titleAfter: after,
    });
    expect(page.hasMore).toBe(true);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.title).toBe('Álgebra');
    expect(collation).toHaveBeenCalledWith({ locale: 'es', strength: 1 });
    const stages = (
      aggregate.mock.calls as unknown as Array<[Array<Record<string, unknown>>]>
    )[0]?.[0];
    const aclIndex = stages.findIndex(
      (stage) =>
        '$match' in stage &&
        JSON.stringify(stage).includes('__resource.visibility'),
    );
    const cursorIndex = stages.findIndex(
      (stage) =>
        '$match' in stage && JSON.stringify(stage).includes('__resource.title'),
    );
    const sortIndex = stages.findIndex(
      (stage) =>
        '$sort' in stage && JSON.stringify(stage).includes('__resource.title'),
    );
    const limitIndex = stages.findIndex((stage) => '$limit' in stage);
    expect(aclIndex).toBeGreaterThan(0);
    expect(cursorIndex).toBeGreaterThan(aclIndex);
    expect(sortIndex).toBeGreaterThan(cursorIndex);
    expect(limitIndex).toBeGreaterThan(sortIndex);
    expect(stages[sortIndex]).toEqual({
      $sort: { '__resource.title': 1, resourceId: 1 },
    });
    expect(stages.at(-1)).toEqual({
      $project: {
        _id: 0,
        resourceId: 1,
        createdAt: 1,
        title: '$__resource.title',
      },
    });
    const cursorMatch = JSON.stringify(stages[cursorIndex]);
    expect(cursorMatch).toContain(
      '"resourceId":{"$gt":"11111111-1111-4111-8111-111111111111"}',
    );
    expect(cursorMatch).toContain('"__resource.title":"Álgebra"');
  });

  it('keeps saved-date ordering and avoids collation for legacy filtered pages', async () => {
    const { store, aggregate, collation } = build();
    await store.searchSavedResources({
      userId: 'owner-1',
      q: 'alg',
      limit: 25,
    });
    const stages = (
      aggregate.mock.calls as unknown as Array<[Array<Record<string, unknown>>]>
    )[0]?.[0];
    expect(stages[1]).toEqual({ $sort: { createdAt: -1, resourceId: 1 } });
    expect(collation).not.toHaveBeenCalled();
  });

  it('returns only a bounded page and signals more after filtering', async () => {
    const now = new Date('2026-10-14T12:00:00.000Z');
    const rows = ['one', 'two', 'three'].map((resourceId) => ({
      resourceId,
      createdAt: now,
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
    expect(new RegExp(savedMetadataRegex('algebra'), 'i').test('álgebra')).toBe(
      true,
    );
    expect(
      new RegExp(savedMetadataRegex('matemática'), 'i').test('matematica'),
    ).toBe(true);
    expect(new RegExp(savedMetadataRegex('sql.*'), 'i').test('sqlXYZ')).toBe(
      false,
    );
  });
});
