import { ACCOUNT_EXPORT_FORMAT_VERSION } from '../domain/account-export.types';
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
  const updateQuery = query({ modifiedCount: 1 });
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

  it('releases retryable claims but makes terminal failures inactive', async () => {
    const f = fixture();

    await expect(
      f.store.reschedule({
        id: 'export-1',
        claimId: 'claim-1',
        state: 'pending',
        nextAttemptAt: now,
        failureCode: 'EXPORT_ASSEMBLY_RETRY',
        failedAt: null,
      }),
    ).resolves.toBe(true);

    expect(f.jobs.updateOne).toHaveBeenLastCalledWith(
      {
        id: 'export-1',
        state: 'processing',
        claimId: 'claim-1',
      },
      {
        $set: {
          state: 'pending',
          active: true,
          nextAttemptAt: now,
          failureCode: 'EXPORT_ASSEMBLY_RETRY',
          failedAt: null,
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
      failedAt: now,
    });

    expect(f.jobs.updateOne).toHaveBeenLastCalledWith(
      {
        id: 'export-1',
        state: 'processing',
        claimId: 'claim-2',
      },
      {
        $set: {
          state: 'failed',
          active: false,
          nextAttemptAt: now,
          failureCode: 'EXPORT_RETRY_EXHAUSTED',
          failedAt: now,
          claimId: null,
          leaseExpiresAt: null,
        },
      },
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
