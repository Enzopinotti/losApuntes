import { MongoFileAssetStore } from './mongo-file.store';
import { FileAssetSchema } from './file.mongo-schema';

describe('MongoFileAssetStore quarantine migration', () => {
  function query(rows: unknown[] = []) {
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

  it('keeps claimed legacy ready assets eligible even without expiresAt', async () => {
    const chain = query([]);
    const find = jest.fn().mockReturnValue(chain);
    const store = new MongoFileAssetStore({ find } as never);
    const now = new Date('2026-10-01T12:00:00.000Z');

    await store.listScannable(now, 20);

    expect(find).toHaveBeenCalledWith({
      $and: [
        {
          $or: [{ claimRef: { $type: 'string' } }, { expiresAt: { $gt: now } }],
        },
        {
          $or: [
            {
              state: 'scan_pending',
              $or: [
                { scanNextAttemptAt: { $exists: false } },
                { scanNextAttemptAt: { $lte: now } },
              ],
            },
            {
              state: 'scanning',
              scanLeaseExpiresAt: { $lte: now },
            },
            {
              state: 'ready',
              scanCompletedAt: { $exists: false },
            },
          ],
        },
      ],
    });
    expect(chain.limit).toHaveBeenCalledWith(20);
  });

  it('removes abandonment expiry when a claimed legacy asset scans clean', async () => {
    const exec = jest.fn().mockResolvedValue({ id: 'asset-1' });
    const lean = jest.fn().mockReturnValue({ exec });
    const findOneAndUpdate = jest.fn().mockReturnValue({ lean });
    const store = new MongoFileAssetStore({ findOneAndUpdate } as never);
    const completedAt = new Date('2026-10-01T12:00:00.000Z');

    await store.markReadyFromScan('asset-1', 'claim-1', {
      scanEngine: 'scanner-v1',
      scanCompletedAt: completedAt,
      readyAt: completedAt,
    });

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      {
        id: 'asset-1',
        state: 'scanning',
        scanClaimId: 'claim-1',
      },
      {
        $set: {
          state: 'ready',
          scanEngine: 'scanner-v1',
          scanCompletedAt: completedAt,
          readyAt: completedAt,
        },
        $unset: {
          failureCode: 1,
          scanNextAttemptAt: 1,
          scanClaimId: 1,
          scanLeaseExpiresAt: 1,
          expiresAt: 1,
        },
      },
      { new: true },
    );
  });

  it('lists only unclaimed expired assets for abandoned-upload reclamation', async () => {
    const chain = query([]);
    const find = jest.fn().mockReturnValue(chain);
    const store = new MongoFileAssetStore({ find } as never);
    const now = new Date('2026-10-01T12:00:00.000Z');

    await store.listReclaimable(now, 20);

    expect(find).toHaveBeenCalledWith({
      expiresAt: { $lte: now },
      claimRef: null,
      $or: [
        {
          state: {
            $in: [
              'pending',
              'scan_pending',
              'ready',
              'rejected',
              'failed',
              'reclaiming',
            ],
          },
        },
        {
          state: 'scanning',
          scanLeaseExpiresAt: { $lte: now },
        },
      ],
    });
    expect(chain.sort).toHaveBeenCalledWith({ expiresAt: 1, id: 1 });
    expect(chain.limit).toHaveBeenCalledWith(20);
  });

  it('repeats the unclaimed predicate in the reclamation compare-and-set', async () => {
    const exec = jest.fn().mockResolvedValue(null);
    const lean = jest.fn().mockReturnValue({ exec });
    const findOneAndUpdate = jest.fn().mockReturnValue({ lean });
    const store = new MongoFileAssetStore({ findOneAndUpdate } as never);
    const now = new Date('2026-10-01T12:00:00.000Z');

    await store.claimForReclamation('asset-1', 'ready', now);

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      {
        id: 'asset-1',
        state: 'ready',
        claimRef: null,
        expiresAt: { $lte: now },
      },
      expect.objectContaining({ $set: { state: 'reclaiming' } }),
      { new: true },
    );
  });

  it('keeps claimRef unique for the one-Resource-per-asset v1 relation', () => {
    const claimIndex = FileAssetSchema.indexes().find(
      ([keys]) => 'claimRef' in keys,
    );

    expect(claimIndex?.[1]).toEqual(
      expect.objectContaining({
        unique: true,
        partialFilterExpression: { claimRef: { $type: 'string' } },
      }),
    );
  });
});
