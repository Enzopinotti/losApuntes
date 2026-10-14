import { MongoResourceStore } from './mongo-resource.store';
import { ResourceSchema } from './resource.mongo-schemas';
import { ResourceAssetUnavailableError } from '../domain/resource.store';

describe('MongoResourceStore owned statistics', () => {
  function aggregateResult(result: unknown) {
    const exec = jest.fn().mockResolvedValue([result]);
    const aggregate = jest.fn().mockReturnValue({ exec });
    const store = new MongoResourceStore(
      {} as never,
      { aggregate } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { store, aggregate };
  }

  it('restricts aggregation to available resources by the authenticated author', async () => {
    const { store, aggregate } = aggregateResult({
      publications: [
        { _id: 'private', count: 1 },
        { _id: 'shared', count: 2 },
        { _id: 'public', count: 3 },
      ],
      totals: [{ saves: 13, shareGrants: 2 }],
      topResources: [
        {
          id: 'r1',
          title: 'SQL',
          visibility: 'shared',
          saves: 9,
          shareGrants: 2,
        },
      ],
    });
    const response = await store.getOwnedStatistics('owner-a');
    expect(response).toEqual({
      publications: { total: 6, private: 1, shared: 2, public: 3 },
      currentSaves: 13,
      activeShareGrants: 2,
      topResources: [
        {
          id: 'r1',
          title: 'SQL',
          visibility: 'shared',
          saves: 9,
          shareGrants: 2,
        },
      ],
    });
    const pipeline = (aggregate.mock.calls as unknown as Array<
      [Array<Record<string, unknown>>]
    >)[0]?.[0];
    expect(pipeline[0]).toEqual({
      $match: { authorUserId: 'owner-a', moderationState: 'available' },
    });
    const text = JSON.stringify(pipeline);
    expect(text).toContain('"from":"resource_saves"');
    expect(text).toContain('"from":"resource_shares"');
    expect(text).toContain('"$eq":["$$visibility","shared"]');
    expect(text).toContain('"$limit":5');
    expect(text).not.toContain('profileId');
    expect(text).not.toContain('userId');
  });

  it('does not count orphaned share grants for a private or public resource', async () => {
    const { store, aggregate } = aggregateResult({
      publications: [{ _id: 'public', count: 1 }],
      totals: [{ saves: 2, shareGrants: 0 }],
      topResources: [
        {
          id: 'r2',
          title: 'Público',
          visibility: 'public',
          saves: 2,
          shareGrants: 0,
        },
      ],
    });
    const response = await store.getOwnedStatistics('owner-b');
    expect(response.activeShareGrants).toBe(0);
    const pipeline = (aggregate.mock.calls as unknown as Array<
      [Array<Record<string, unknown>>]
    >)[0]?.[0];
    const text = JSON.stringify(pipeline);
    expect(text).toContain('"$eq":["$$visibility","shared"]');
  });

  it('returns zero counts for a new author without any resources', async () => {
    const { store } = aggregateResult({
      publications: [],
      totals: [],
      topResources: [],
    });
    expect(await store.getOwnedStatistics('new-owner')).toEqual({
      publications: { total: 0, private: 0, shared: 0, public: 0 },
      currentSaves: 0,
      activeShareGrants: 0,
      topResources: [],
    });
  });
});

describe('MongoResourceStore owned library advanced browsing', () => {
  function mockResources() {
    const query = {
      sort: jest.fn(),
      limit: jest.fn(),
      lean: jest.fn(),
      exec: jest.fn().mockResolvedValue([]),
    };
    query.sort.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    query.lean.mockReturnValue(query);
    const resources = {
      find: jest.fn().mockReturnValue(query),
      aggregate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      }),
    };
    const store = new MongoResourceStore(
      {} as never,
      resources as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { store, resources, query };
  }

  it('applies all filters server-side before paginating oldest-first', async () => {
    const { store, resources, query } = mockResources();
    const after = {
      createdAt: new Date('2026-10-01T12:00:00.000Z'),
      id: '11111111-1111-4111-8111-111111111111',
    };
    await store.listOwnedResources({
      authorUserId: 'author-a',
      visibility: 'shared',
      subjectId: '22222222-2222-4222-8222-222222222222',
      q: 'c++ (avanzado)',
      order: 'oldest',
      limit: 25,
      after,
    });
    expect(resources.find).toHaveBeenCalledWith({
      authorUserId: 'author-a',
      moderationState: 'available',
      visibility: 'shared',
      subjectId: '22222222-2222-4222-8222-222222222222',
      searchText: { $regex: 'c\\+\\+ \\(avanzado\\)', $options: 'i' },
      $or: [
        { createdAt: { $gt: after.createdAt } },
        { createdAt: after.createdAt, id: { $gt: after.id } },
      ],
    });
    expect(query.sort).toHaveBeenCalledWith({ createdAt: 1, id: 1 });
    expect(query.limit).toHaveBeenCalledWith(26);
  });

  it('preserves original newest-first ordering with no new filters', async () => {
    const { store, query } = mockResources();
    await store.listOwnedResources({ authorUserId: 'author-a', limit: 25 });
    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1, id: 1 });
  });

  it('limits subject facets to this author and at most fifty subjects', async () => {
    const { store, resources } = mockResources();
    await store.listOwnedSubjects('author-a');
    const pipeline = (resources.aggregate.mock.calls as unknown as Array<
      [Array<Record<string, unknown>>]
    >)[0]?.[0];
    expect(pipeline[0]).toEqual({
      $match: { authorUserId: 'author-a', moderationState: 'available' },
    });
    expect(pipeline).toContainEqual({ $limit: 51 });
    expect(pipeline).toContainEqual({ $sort: { count: -1, _id: 1 } });
  });

  it('marks subject facets as truncated rather than claiming all are shown', async () => {
    const { store, resources } = mockResources();
    const rows = Array.from({ length: 51 }, (_, i) => ({
      subjectId: `subject-${i}`,
      count: 51 - i,
    }));
    resources.aggregate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(rows),
    });
    const page = await store.listOwnedSubjects('author-a');
    expect(page.items).toHaveLength(50);
    expect(page.truncated).toBe(true);
  });
});

describe('MongoResourceStore owner publications library', () => {
  function resourcesQuery(rows: unknown[]) {
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

  it('limits publications to the author and excludes moderated hidden resources', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `resource-${i}`,
      authorUserId: 'author-a',
    }));
    const chain = resourcesQuery(rows);
    const resources = { find: jest.fn().mockReturnValue(chain) };
    const store = new MongoResourceStore(
      {} as never,
      resources as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await store.listOwnedResources({
      authorUserId: 'author-a',
      limit: 2,
    });
    expect(resources.find).toHaveBeenCalledWith({
      authorUserId: 'author-a',
      moderationState: 'available',
    });
    expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1, id: 1 });
    expect(chain.limit).toHaveBeenCalledWith(3);
    expect(result).toEqual({ items: rows.slice(0, 2), hasMore: true });
  });

  it('uses the owner and visibility constraints on every page', async () => {
    const chain = resourcesQuery([]);
    const resources = { find: jest.fn().mockReturnValue(chain) };
    const store = new MongoResourceStore(
      {} as never,
      resources as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const createdAt = new Date('2026-10-12T12:00:00.000Z');
    await store.listOwnedResources({
      authorUserId: 'author-b',
      visibility: 'shared',
      limit: 25,
      after: {
        id: '11111111-1111-4111-8111-111111111111',
        createdAt,
      },
    });

    expect(resources.find).toHaveBeenCalledWith({
      authorUserId: 'author-b',
      moderationState: 'available',
      visibility: 'shared',
      $or: [
        { createdAt: { $lt: createdAt } },
        {
          createdAt,
          id: { $gt: '11111111-1111-4111-8111-111111111111' },
        },
      ],
    });
    expect(chain.limit).toHaveBeenCalledWith(26);
  });
});

describe('MongoResourceStore owner share listing', () => {
  function shareQuery(
    rows: Array<{
      _id: { toHexString(): string };
      userId: string;
      createdAt: Date;
    }>,
  ) {
    const chain = {
      select: jest.fn(),
      sort: jest.fn(),
      limit: jest.fn(),
      lean: jest.fn(),
      exec: jest.fn().mockResolvedValue(rows),
    };
    chain.select.mockReturnValue(chain);
    chain.sort.mockReturnValue(chain);
    chain.limit.mockReturnValue(chain);
    chain.lean.mockReturnValue(chain);
    return chain;
  }

  it('reads a bounded resource-scoped page sorted by share document ID', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      _id: { toHexString: () => `507f1f77bcf86cd79943901${i}` },
      userId: `private-user-${i}`,
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
    }));
    const chain = shareQuery(rows);
    const shares = { find: jest.fn().mockReturnValue(chain) };
    const store = new MongoResourceStore(
      {} as never,
      {} as never,
      shares as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const page = await store.listShareGrants({
      resourceId: 'resource-a',
      limit: 2,
    });
    expect(shares.find).toHaveBeenCalledWith({ resourceId: 'resource-a' });
    expect(chain.select).toHaveBeenCalledWith({
      _id: 1,
      userId: 1,
      createdAt: 1,
    });
    expect(chain.sort).toHaveBeenCalledWith({ _id: 1 });
    expect(chain.limit).toHaveBeenCalledWith(3);
    expect(page).toEqual({
      items: [
        {
          shareId: '507f1f77bcf86cd799439010',
          userId: 'private-user-0',
          createdAt: rows[0].createdAt,
        },
        {
          shareId: '507f1f77bcf86cd799439011',
          userId: 'private-user-1',
          createdAt: rows[1].createdAt,
        },
      ],
      hasMore: true,
    });
  });

  it('continues exclusively after the prior share ID', async () => {
    const chain = shareQuery([]);
    const shares = { find: jest.fn().mockReturnValue(chain) };
    const store = new MongoResourceStore(
      {} as never,
      {} as never,
      shares as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await store.listShareGrants({
      resourceId: 'resource-b',
      limit: 20,
      after: { shareId: '507f1f77bcf86cd799439011' },
    });
    const findCalls = shares.find.mock.calls as unknown as Array<
      [{ resourceId: string; _id: { $gt: { toHexString(): string } } }]
    >;
    expect(findCalls[0]?.[0].resourceId).toBe('resource-b');
    expect(findCalls[0]?.[0]._id.$gt.toHexString()).toBe(
      '507f1f77bcf86cd799439011',
    );
    expect(chain.limit).toHaveBeenCalledWith(21);
  });
});

describe('MongoResourceStore saved-resource pagination', () => {
  function savedQuery(rows: Array<{ resourceId: string; createdAt: Date }>) {
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

  it('uses limit+1 and exposes saved-resource overflow honestly', async () => {
    const rows = Array.from({ length: 3 }, (_, index) => ({
      resourceId: `resource-${index}`,
      createdAt: new Date(`2026-09-2${3 - index}T12:00:00.000Z`),
    }));
    const chain = savedQuery(rows);
    const saves = { find: jest.fn().mockReturnValue(chain) };
    const store = new MongoResourceStore(
      {} as never,
      {} as never,
      {} as never,
      saves as never,
      {} as never,
      {} as never,
    );

    const result = await store.listSavedResources({
      userId: 'user-1',
      limit: 2,
    });

    expect(saves.find).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(chain.sort).toHaveBeenCalledWith({
      createdAt: -1,
      resourceId: 1,
    });
    expect(chain.limit).toHaveBeenCalledWith(3);
    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(true);
  });

  it('applies the stable createdAt/resourceId continuation predicate', async () => {
    const chain = savedQuery([]);
    const saves = { find: jest.fn().mockReturnValue(chain) };
    const store = new MongoResourceStore(
      {} as never,
      {} as never,
      {} as never,
      saves as never,
      {} as never,
      {} as never,
    );
    const createdAt = new Date('2026-09-23T12:00:00.000Z');

    await store.listSavedResources({
      userId: 'user-1',
      limit: 25,
      after: { createdAt, resourceId: 'resource-a' },
    });

    expect(saves.find).toHaveBeenCalledWith({
      userId: 'user-1',
      $or: [
        { createdAt: { $lt: createdAt } },
        {
          createdAt,
          resourceId: { $gt: 'resource-a' },
        },
      ],
    });
    expect(chain.limit).toHaveBeenCalledWith(26);
  });
});

describe('MongoResourceStore authorization pipeline', () => {
  it('scopes explicit shares to the current outer resource', async () => {
    const exec = jest.fn().mockResolvedValue([]);
    let capturedPipeline: unknown = null;
    const aggregate = jest.fn((pipeline: unknown) => {
      capturedPipeline = pipeline;
      return { exec };
    });

    const store = new MongoResourceStore(
      {} as never,
      { aggregate } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await store.searchAuthorized({
      viewerUserId: 'viewer-1',
      visibility: 'shared',
      limit: 25,
    });

    expect(Array.isArray(capturedPipeline)).toBe(true);
    const pipelineJson = JSON.stringify(capturedPipeline);
    expect(pipelineJson).toContain('"from":"resource_shares"');
    expect(pipelineJson).toContain('"resourceId":"$id"');
    expect(pipelineJson).toContain('["$resourceId","$$resourceId"]');
    expect(pipelineJson).toContain('["$userId","viewer-1"]');
    expect(pipelineJson).toContain('"visibility":"shared"');
    expect(pipelineJson).toContain('"__viewerShares.0":{"$exists":true}');
  });

  it('clears explicit grants transactionally when visibility leaves shared', async () => {
    const updated = {
      id: '11111111-1111-4111-8111-111111111111',
      visibility: 'private',
      revision: 2,
    };
    const updateExec = jest.fn().mockResolvedValue(updated);
    const lean = jest.fn().mockReturnValue({ exec: updateExec });
    const findOneAndUpdate = jest.fn().mockReturnValue({ lean });
    const deleteExec = jest.fn().mockResolvedValue({ deletedCount: 2 });
    const deleteMany = jest.fn().mockReturnValue({ exec: deleteExec });
    const session = {
      withTransaction: jest.fn(async (operation: () => Promise<void>) =>
        operation(),
      ),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    const startSession = jest.fn().mockResolvedValue(session);

    const store = new MongoResourceStore(
      { startSession } as never,
      { findOneAndUpdate } as never,
      { deleteMany } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      store.updateOwned(updated.id, 'author-1', 1, {
        visibility: 'private',
      }),
    ).resolves.toEqual(updated);

    expect(startSession).toHaveBeenCalledTimes(1);
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { id: updated.id, authorUserId: 'author-1', revision: 1 },
      {
        $set: { visibility: 'private' },
        $inc: { revision: 1 },
      },
      { new: true, session },
    );
    expect(deleteMany).toHaveBeenCalledWith(
      { resourceId: updated.id },
      { session },
    );
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it('does not clear grants when visibility remains shared', async () => {
    const updated = {
      id: '11111111-1111-4111-8111-111111111111',
      visibility: 'shared',
      revision: 2,
    };
    const exec = jest.fn().mockResolvedValue(updated);
    const lean = jest.fn().mockReturnValue({ exec });
    const findOneAndUpdate = jest.fn().mockReturnValue({ lean });
    const startSession = jest.fn();

    const store = new MongoResourceStore(
      { startSession } as never,
      { findOneAndUpdate } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      store.updateOwned(updated.id, 'author-1', 1, {
        visibility: 'shared',
      }),
    ).resolves.toEqual(updated);

    expect(startSession).not.toHaveBeenCalled();
  });

  it('claims only ready assets with completed safety-scan evidence', async () => {
    const asset = {
      id: 'asset-1',
      state: 'ready',
      scanCompletedAt: new Date('2026-10-01T12:00:00.000Z'),
      scanEngine: 'scanner-v1',
    };
    const assetExec = jest.fn().mockResolvedValue(asset);
    const assetLean = jest.fn().mockReturnValue({ exec: assetExec });
    const findOneAndUpdate = jest.fn().mockReturnValue({ lean: assetLean });
    const resources = {
      create: jest.fn().mockResolvedValue([
        {
          id: 'resource-1',
          assetId: 'asset-1',
          toObject: () => ({ id: 'resource-1', assetId: 'asset-1' }),
        },
      ]),
    };
    const session = {
      withTransaction: jest.fn(async (operation: () => Promise<void>) =>
        operation(),
      ),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    const store = new MongoResourceStore(
      { startSession: jest.fn().mockResolvedValue(session) } as never,
      resources as never,
      {} as never,
      {} as never,
      {} as never,
      { findOneAndUpdate } as never,
    );
    const now = new Date('2026-10-01T12:00:00.000Z');

    await store.createClaimingAsset({
      actorUserId: 'user-1',
      now,
      resource: {
        id: 'resource-1',
        assetId: 'asset-1',
      } as never,
    });

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'asset-1',
        creatorUserId: 'user-1',
        state: 'ready',
        scanCompletedAt: { $type: 'date' },
        scanEngine: { $type: 'string' },
        claimRef: null,
        expiresAt: { $gt: now },
      }),
      {
        $set: { claimRef: 'resource:resource-1', claimedAt: now },
        $unset: { expiresAt: 1 },
      },
      expect.objectContaining({ new: true, session }),
    );
    expect(resources.create).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'resource-1', assetId: 'asset-1' })],
      { session },
    );
  });

  it('does not create another Resource when the FileAsset is already claimed', async () => {
    const assetExec = jest.fn().mockResolvedValue(null);
    const assetLean = jest.fn().mockReturnValue({ exec: assetExec });
    const findOneAndUpdate = jest.fn().mockReturnValue({ lean: assetLean });
    const resources = { create: jest.fn() };
    const session = {
      withTransaction: jest.fn(async (operation: () => Promise<void>) =>
        operation(),
      ),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    const store = new MongoResourceStore(
      { startSession: jest.fn().mockResolvedValue(session) } as never,
      resources as never,
      {} as never,
      {} as never,
      {} as never,
      { findOneAndUpdate } as never,
    );

    await expect(
      store.createClaimingAsset({
        actorUserId: 'user-1',
        now: new Date('2026-10-01T12:00:00.000Z'),
        resource: { id: 'resource-2', assetId: 'asset-1' } as never,
      }),
    ).rejects.toBeInstanceOf(ResourceAssetUnavailableError);

    expect(resources.create).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
});

describe('Resource/FileAsset v1 cardinality', () => {
  it('keeps each FileAsset attached to at most one Resource', () => {
    expect(ResourceSchema.path('assetId')?.options.unique).toBe(true);
  });
});
