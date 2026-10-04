import { FileAssetSchema } from '../../files/mongo/file.mongo-schema';
import { MongoResourceStore } from './mongo-resource.store';
import { ResourceSchema } from './resource.mongo-schemas';

describe('Resource/FileAsset lifecycle cardinality', () => {
  it('keeps the current v1 Resource-to-claimed-FileAsset relationship one-to-one', () => {
    expect(
      ResourceSchema.indexes().some(
        ([fields, options]) =>
          fields.assetId === 1 && options.unique === true,
      ),
    ).toBe(true);

    expect(
      FileAssetSchema.indexes().some(
        ([fields, options]) =>
          fields.claimRef === 1 &&
          options.unique === true &&
          JSON.stringify(options.partialFilterExpression) ===
            JSON.stringify({ claimRef: { $type: 'string' } }),
      ),
    ).toBe(true);
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
        $set: {
          claimRef: 'resource:resource-1',
          claimedAt: now,
        },
        $unset: { expiresAt: 1 },
      },
      expect.objectContaining({ new: true, session }),
    );
  });
});
