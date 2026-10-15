import { ACCOUNT_EXPORT_FORMAT_VERSION } from '../domain/account-export.types';
import { AccountExportJobSchema } from './account-export.mongo-schema';
import { MongoAccountExportStore } from './mongo-account-export.store';

const now = new Date('2026-10-04T23:55:00.000Z');

function query<T>(value: T) {
  return {
    lean: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };
}

function fixture(input: { active?: unknown } = {}) {
  const upsertQuery = query(input.active ?? null);
  const findQuery = query(input.active ?? null);
  const expiredQuery = query([]);
  const claimQuery = query(input.active ?? null);
  const updateQuery = query({ matchedCount: 1, modifiedCount: 1 });
  const jobs = {
    findOneAndUpdate: jest
      .fn()
      .mockReturnValueOnce(upsertQuery)
      .mockReturnValue(claimQuery),
    findOne: jest.fn(() => findQuery),
    find: jest.fn(() => expiredQuery),
    updateOne: jest.fn(() => updateQuery),
    exists: jest.fn().mockResolvedValue(null),
  };
  const ownerUpdate = query({ matchedCount: 1, modifiedCount: 1 });
  const users = { updateOne: jest.fn(() => ownerUpdate) };
  const session = {
    withTransaction: jest.fn(async (callback: () => Promise<void>) => callback()),
    endSession: jest.fn().mockResolvedValue(undefined),
  };
  const connection = { startSession: jest.fn().mockResolvedValue(session) };
  const store = new MongoAccountExportStore(
    jobs as never, users as never, connection as never,
  );

  return {
    store,
    jobs,
    users,
    ownerUpdate,
    session,
    connection,
    upsertQuery,
    findQuery,
    expiredQuery,
    claimQuery,
    updateQuery,
  };
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: 'export-1',
    userId: 'user-1',
    state: 'pending',
    active: true,
    formatVersion: ACCOUNT_EXPORT_FORMAT_VERSION,
    attempts: 0,
    nextAttemptAt: now,
    claimId: null,
    leaseExpiresAt: null,
    failureCode: null,
    failedAt: null,
    completedAt: null,
    artifactSectionCount: null,
    artifactRecordCount: null,
    artifactByteLength: null,
    artifactSha256: null,
    artifactGeneration: null,
    artifactExpiresAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('MongoAccountExportStore', () => {
  it('creates or replays the single active export for one user', async () => {
    const active = record();
    const f = fixture({ active });

    await expect(
      f.store.requestActive({
        id: 'export-1',
        userId: 'user-1',
        formatVersion: ACCOUNT_EXPORT_FORMAT_VERSION,
        now,
      }),
    ).resolves.toEqual({ job: active, created: true });

    expect(f.jobs.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'user-1', active: true },
      {
        $setOnInsert: {
          id: 'export-1',
          userId: 'user-1',
          state: 'pending',
          active: true,
          formatVersion: ACCOUNT_EXPORT_FORMAT_VERSION,
          attempts: 0,
          nextAttemptAt: now,
          claimId: null,
          leaseExpiresAt: null,
          failureCode: null,
          failedAt: null,
          completedAt: null,
          artifactSectionCount: null,
          artifactRecordCount: null,
          artifactByteLength: null,
          artifactSha256: null,
          artifactGeneration: null,
          artifactExpiresAt: null,
        },
      },
      { upsert: true, new: true },
    );
  });

  it('recovers a concurrent upsert duplicate by replaying the winning active job', async () => {
    const winner = record({ id: 'winner' });
    const f = fixture({ active: winner });
    f.upsertQuery.exec.mockRejectedValueOnce({ code: 11000 });

    await expect(
      f.store.requestActive({
        id: 'loser',
        userId: 'user-1',
        formatVersion: ACCOUNT_EXPORT_FORMAT_VERSION,
        now,
      }),
    ).resolves.toEqual({ job: winner, created: false });

    expect(f.jobs.findOne).toHaveBeenCalledWith({
      userId: 'user-1',
      active: true,
    });
  });

  it('claims pending work or an expired processing lease with one CAS', async () => {
    const claimed = record({
      state: 'processing',
      attempts: 2,
      claimId: 'claim-2',
    });
    const f = fixture({ active: record() });
    f.claimQuery.exec.mockResolvedValue(claimed);
    f.jobs.findOneAndUpdate.mockReset().mockReturnValue(f.claimQuery);
    const leaseExpiresAt = new Date(now.getTime() + 120_000);

    await expect(
      f.store.claimNext({
        now,
        claimId: 'claim-2',
        leaseExpiresAt,
      }),
    ).resolves.toEqual(claimed);

    expect(f.jobs.findOneAndUpdate.mock.calls[0]).toEqual([
      {
        active: true,
        $or: [
          { state: 'pending', nextAttemptAt: { $lte: now } },
          {
            state: 'processing',
            leaseExpiresAt: { $lte: now },
          },
        ],
      },
      {
        $set: {
          state: 'processing',
          claimId: 'claim-2',
          leaseExpiresAt,
          failureCode: null,
          failedAt: null,
        },
        $inc: { attempts: 1 },
      },
      {
        new: true,
        sort: { nextAttemptAt: 1, createdAt: 1, userId: 1 },
      },
    ]);
  });

  it('renews only a current active claim and never shortens its lease', async () => {
    const f = fixture();

    await expect(
      f.store.renewLease({
        id: 'export-1',
        claimId: 'claim-1',
        now,
        leaseExpiresAt: new Date(now.getTime() + 120_000),
      }),
    ).resolves.toBe(true);

    expect(f.jobs.updateOne).toHaveBeenCalledWith(
      {
        id: 'export-1',
        active: true,
        state: 'processing',
        claimId: 'claim-1',
        leaseExpiresAt: { $gt: now },
      },
      {
        $max: { leaseExpiresAt: new Date(now.getTime() + 120_000) },
      },
    );
  });

  it('rejects a renewal after the claim expires or changes', async () => {
    const f = fixture();
    f.updateQuery.exec.mockResolvedValueOnce({
      matchedCount: 0,
      modifiedCount: 0,
    });

    await expect(
      f.store.renewLease({
        id: 'export-1',
        claimId: 'stale-claim',
        now,
        leaseExpiresAt: new Date(now.getTime() + 120_000),
      }),
    ).resolves.toBe(false);
  });

  it('rejects an unknown failure code before the Mongo update', async () => {
    const f = fixture();

    await expect(
      f.store.reschedule({
        id: 'export-1',
        claimId: 'claim-1',
        state: 'failed',
        nextAttemptAt: now,
        failureCode: 'private-user@example.com' as never,
        now,
      }),
    ).rejects.toThrow('failure code is invalid');

    expect(f.jobs.updateOne.mock.calls).toHaveLength(0);
  });

  it('releases retryable claims but makes terminal failures inactive', async () => {
    const f = fixture();

    await expect(
      f.store.reschedule({
        id: 'export-1',
        claimId: 'claim-1',
        state: 'pending',
        nextAttemptAt: now,
        failureCode: 'EXPORT_ASSEMBLY_RETRY',
        now,
      }),
    ).resolves.toBe(true);

    expect(f.jobs.updateOne).toHaveBeenLastCalledWith(
      {
        id: 'export-1',
        active: true,
        state: 'processing',
        claimId: 'claim-1',
        leaseExpiresAt: { $gt: now },
      },
      {
        $set: {
          state: 'pending',
          active: true,
          nextAttemptAt: now,
          failureCode: 'EXPORT_ASSEMBLY_RETRY',
          failedAt: null,
          completedAt: null,
          artifactSectionCount: null,
          artifactRecordCount: null,
          artifactByteLength: null,
          artifactSha256: null,
          artifactGeneration: null,
          artifactExpiresAt: null,
          claimId: null,
          leaseExpiresAt: null,
        },
      },
    );

    await f.store.reschedule({
      id: 'export-1',
      claimId: 'claim-2',
      state: 'failed',
      nextAttemptAt: now,
      failureCode: 'EXPORT_RETRY_EXHAUSTED',
      now,
    });

    expect(f.jobs.updateOne).toHaveBeenLastCalledWith(
      {
        id: 'export-1',
        active: true,
        state: 'processing',
        claimId: 'claim-2',
        leaseExpiresAt: { $gt: now },
      },
      {
        $set: {
          state: 'failed',
          active: false,
          nextAttemptAt: now,
          failureCode: 'EXPORT_RETRY_EXHAUSTED',
          failedAt: now,
          completedAt: null,
          artifactSectionCount: null,
          artifactRecordCount: null,
          artifactByteLength: null,
          artifactSha256: null,
          artifactGeneration: null,
          artifactExpiresAt: null,
          claimId: null,
          leaseExpiresAt: null,
        },
      },
    );
  });

  it('leaves an expired lease untouched during retry scheduling', async () => {
    const f = fixture();
    f.updateQuery.exec.mockResolvedValueOnce({ modifiedCount: 0 });

    await expect(
      f.store.reschedule({
        id: 'export-1',
        claimId: 'claim-1',
        state: 'pending',
        nextAttemptAt: now,
        failureCode: 'EXPORT_ASSEMBLY_RETRY',
        now,
      }),
    ).resolves.toBe(false);

    expect(f.jobs.updateOne).toHaveBeenCalledWith(
      {
        id: 'export-1',
        active: true,
        state: 'processing',
        claimId: 'claim-1',
        leaseExpiresAt: { $gt: now },
      },
      expect.any(Object),
    );
  });

  it('completes through the current claim while its lease is still valid', async () => {
    const f = fixture();
    const result = {
      format: 'los-apuntes-account-export' as const,
      formatVersion: ACCOUNT_EXPORT_FORMAT_VERSION,
      sectionCount: 3,
      recordCount: 7,
      byteLength: 512,
      sha256: 'a'.repeat(64),
    } as const;

    await expect(
      f.store.complete({
        id: 'export-1',
        claimId: 'claim-1',
        artifactGeneration: 'claim-1',
        completedAt: now,
        artifactExpiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        result,
      }),
    ).resolves.toBe(true);

    expect(f.jobs.updateOne).toHaveBeenCalledWith(
      {
        id: 'export-1',
        active: true,
        state: 'processing',
        formatVersion: ACCOUNT_EXPORT_FORMAT_VERSION,
        claimId: 'claim-1',
        leaseExpiresAt: { $gt: now },
      },
      {
        $set: {
          state: 'completed',
          active: false,
          claimId: null,
          leaseExpiresAt: null,
          failureCode: null,
          failedAt: null,
          completedAt: now,
          artifactSectionCount: 3,
          artifactRecordCount: 7,
          artifactByteLength: 512,
          artifactSha256: 'a'.repeat(64),
          artifactGeneration: 'claim-1',
          artifactExpiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
      },
    );
  });

  it('returns false for a stale claim without reporting completion', async () => {
    const f = fixture();
    f.updateQuery.exec.mockResolvedValueOnce({ modifiedCount: 0 });

    await expect(
      f.store.complete({
        id: 'export-1',
        claimId: 'stale-claim',
        artifactGeneration: 'stale-claim',
        completedAt: now,
        artifactExpiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        result: {
          format: 'los-apuntes-account-export',
          formatVersion: ACCOUNT_EXPORT_FORMAT_VERSION,
          sectionCount: 0,
          recordCount: 0,
          byteLength: 16,
          sha256: 'b'.repeat(64),
        },
      }),
    ).resolves.toBe(false);
  });

  it('B65 atomically fences v3 owner epoch and completed claim', async () => {
    const f = fixture();
    const result = {
      format: 'los-apuntes-account-export' as const,
      formatVersion: 3 as const,
      sectionCount: 32, recordCount: 1, byteLength: 1024,
      sha256: 'b'.repeat(64),
    };
    await expect(f.store.complete({
      id: 'export-1', claimId: 'claim-1', artifactGeneration: 'claim-1',
      ownerUserId: 'user-1', expectedProgressEpoch: 7,
      completedAt: now, artifactExpiresAt: new Date(now.getTime() + 120_000),
      result,
    })).resolves.toBe(true);
    expect(f.connection.startSession).toHaveBeenCalledTimes(1);
    expect(f.users.updateOne).toHaveBeenCalledWith({
      _id: 'user-1',
      $and: [
        { $or: [
          { account_status: 'active' },
          { account_status: { $exists: false } },
        ] },
        { account_lifecycle_revision: 7 },
      ],
    }, { $inc: { account_lifecycle_revision: 1 } }, { session: f.session });
    expect(f.jobs.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'export-1', claimId: 'claim-1', formatVersion: 3,
      }),
      expect.objectContaining({
        $set: expect.objectContaining({ state: 'completed', artifactSectionCount: 32 }),
      }),
      { session: f.session },
    );
    expect(f.session.endSession).toHaveBeenCalledTimes(1);
  });

  it('B65 rejects concurrent progress edits without completing a v3 job', async () => {
    const f = fixture();
    f.ownerUpdate.exec.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });
    const result = {
      format: 'los-apuntes-account-export' as const,
      formatVersion: 3 as const,
      sectionCount: 32, recordCount: 0, byteLength: 12, sha256: 'a'.repeat(64),
    };
    await expect(f.store.complete({
      id: 'export-1', claimId: 'claim-1', artifactGeneration: 'claim-1',
      ownerUserId: 'user-1', expectedProgressEpoch: 9,
      completedAt: now, artifactExpiresAt: new Date(now.getTime() + 120_000),
      result,
    })).rejects.toThrow('Study progress changed during account export');
    expect(f.jobs.updateOne).not.toHaveBeenCalled();
    expect(f.session.endSession).toHaveBeenCalledTimes(1);
  });

  it('B65 supports a legacy zero epoch only for absent or zero revisions', async () => {
    const f = fixture();
    await f.store.complete({
      id: 'export-1', claimId: 'claim-1', artifactGeneration: 'claim-1',
      ownerUserId: 'user-1', expectedProgressEpoch: 0,
      completedAt: now, artifactExpiresAt: new Date(now.getTime() + 120_000),
      result: {
        format: 'los-apuntes-account-export', formatVersion: 3,
        sectionCount: 32, recordCount: 0, byteLength: 12, sha256: 'a'.repeat(64),
      },
    });
    expect(f.users.updateOne.mock.calls[0]?.[0]).toMatchObject({
      $and: [
        expect.anything(),
        { $or: [
          { account_lifecycle_revision: 0 },
          { account_lifecycle_revision: { $exists: false } },
        ] },
      ],
    });
  });

  it('B65 rolls back the owner fence if the export claim expired', async () => {
    const f = fixture();
    f.updateQuery.exec.mockResolvedValueOnce({ modifiedCount: 0 });
    await expect(f.store.complete({
      id: 'export-1', claimId: 'stale-claim', artifactGeneration: 'stale-claim',
      ownerUserId: 'user-1', expectedProgressEpoch: 2,
      completedAt: now, artifactExpiresAt: new Date(now.getTime() + 120_000),
      result: {
        format: 'los-apuntes-account-export', formatVersion: 3,
        sectionCount: 32, recordCount: 0, byteLength: 12, sha256: 'a'.repeat(64),
      },
    })).resolves.toBe(false);
    expect(f.session.withTransaction).toHaveBeenCalled();
    expect(f.session.endSession).toHaveBeenCalledTimes(1);
  });

  it('B65 refuses an unfenced v3 durable completion', async () => {
    const f = fixture();
    await expect(f.store.complete({
      id: 'export-1', claimId: 'claim-1', artifactGeneration: 'claim-1',
      completedAt: now, artifactExpiresAt: new Date(now.getTime() + 120_000),
      result: {
        format: 'los-apuntes-account-export', formatVersion: 3,
        sectionCount: 32, recordCount: 0, byteLength: 12, sha256: 'a'.repeat(64),
      },
    })).rejects.toThrow('owner epoch is required');
    expect(f.jobs.updateOne).not.toHaveBeenCalled();
    expect(f.connection.startSession).not.toHaveBeenCalled();
  });

  it('stores only the internal completion summary on the job schema', () => {
    const state = AccountExportJobSchema.path('state') as unknown as {
      enumValues: string[];
    };

    expect(state.enumValues).toContain('completed');
    expect(AccountExportJobSchema.path('completedAt')).toBeDefined();
    expect(AccountExportJobSchema.path('artifactSectionCount')).toBeDefined();
    expect(AccountExportJobSchema.path('artifactRecordCount')).toBeDefined();
    expect(AccountExportJobSchema.path('artifactByteLength')).toBeDefined();
    expect(AccountExportJobSchema.path('artifactSha256')).toBeDefined();
    expect(AccountExportJobSchema.path('artifactGeneration')).toBeDefined();
    expect(AccountExportJobSchema.path('artifactExpiresAt')).toBeDefined();
    expect(AccountExportJobSchema.path('objectKey')).toBeUndefined();
    expect(AccountExportJobSchema.path('downloadUrl')).toBeUndefined();
  });

  it('selects only due completed artifacts in bounded expiry order', async () => {
    const expiresAt = new Date(now.getTime() - 1);
    const f = fixture();
    f.expiredQuery.exec.mockResolvedValueOnce([
      {
        id: 'export-1',
        artifactGeneration: 'generation-1',
        artifactExpiresAt: expiresAt,
      },
    ]);

    await expect(
      f.store.findExpiredArtifacts({ now, limit: 12 }),
    ).resolves.toEqual([
      { id: 'export-1', generation: 'generation-1', expiresAt },
    ]);
    expect(f.jobs.find).toHaveBeenCalledWith({
      state: 'completed',
      artifactGeneration: { $type: 'string' },
      artifactExpiresAt: { $lte: now },
    });
    expect(f.expiredQuery.sort).toHaveBeenCalledWith({
      artifactExpiresAt: 1,
      id: 1,
    });
    expect(f.expiredQuery.limit).toHaveBeenCalledWith(12);
    expect(f.expiredQuery.select).toHaveBeenCalledWith({
      id: 1,
      artifactGeneration: 1,
      artifactExpiresAt: 1,
    });
  });

  it('clears only the exact expired generation after object deletion', async () => {
    const expiresAt = new Date(now.getTime() - 1);
    const f = fixture();

    await expect(
      f.store.clearExpiredArtifact({
        id: 'export-1',
        generation: 'generation-1',
        expiresAt,
        now,
      }),
    ).resolves.toBe(true);
    expect(f.jobs.updateOne).toHaveBeenCalledWith(
      {
        id: 'export-1',
        state: 'completed',
        artifactGeneration: 'generation-1',
        artifactExpiresAt: { $eq: expiresAt, $lte: now },
      },
      { $set: { artifactGeneration: null } },
    );
  });

  it('keeps status reads owner-scoped and terminal failures observable', async () => {
    const row = record();
    const f = fixture({ active: row });
    f.jobs.exists.mockResolvedValue({ _id: 'failed' });

    await expect(f.store.findOwned('export-1', 'user-1')).resolves.toEqual(row);
    expect(f.jobs.findOne).toHaveBeenCalledWith({
      id: 'export-1',
      userId: 'user-1',
    });
    await expect(f.store.hasFailed()).resolves.toBe(true);
    expect(f.jobs.exists).toHaveBeenCalledWith({ state: 'failed' });
  });
});
