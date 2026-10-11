import { ACCOUNT_EXPORT_FORMAT_VERSION } from '../domain/account-export.types';
import { AccountExportJobSchema } from './account-export.mongo-schema';
import { MongoAccountExportStore } from './mongo-account-export.store';

const now = new Date('2026-10-04T23:55:00.000Z');

function query<T>(value: T) {
  return {
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };
}

function fixture(input: { active?: unknown } = {}) {
  const upsertQuery = query(input.active ?? null);
  const findQuery = query(input.active ?? null);
  const claimQuery = query(input.active ?? null);
  const updateQuery = query({ matchedCount: 1, modifiedCount: 1 });
  const jobs = {
    findOneAndUpdate: jest
      .fn()
      .mockReturnValueOnce(upsertQuery)
      .mockReturnValue(claimQuery),
    findOne: jest.fn(() => findQuery),
    updateOne: jest.fn(() => updateQuery),
    exists: jest.fn().mockResolvedValue(null),
  };
  const store = new MongoAccountExportStore(jobs as never);

  return {
    store,
    jobs,
    upsertQuery,
    findQuery,
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
        completedAt: now,
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
        completedAt: now,
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
    expect(AccountExportJobSchema.path('objectKey')).toBeUndefined();
    expect(AccountExportJobSchema.path('downloadUrl')).toBeUndefined();
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
