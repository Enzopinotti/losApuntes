import { ForbiddenException } from '@nestjs/common';

import type { AccountExportArtifactSink } from './account-export-assembler';
import type { AccountExportAssembler } from './account-export-assembler';
import { AccountExportService } from './account-export.service';
import type { AccountExportStore } from './account-export.store';
import type { AccountExportOrphanCleanupStore } from './account-export-orphan-cleanup.store';
import type {
  AccountExportAssemblyResult,
  AccountExportJobRecord,
} from './account-export.types';
import { ACCOUNT_EXPORT_LEASE_DURATION_MS } from './account-export.types';
import type { AccountExportArtifactStorage } from '../storage/account-export-artifact-storage';
import { AccountExportProcessor } from './account-export-processor';
import { AccountExportEpochConflictError } from './account-export-epoch-conflict.error';

const now = new Date('2026-10-11T12:00:00.000Z');
const result: AccountExportAssemblyResult = {
  format: 'los-apuntes-account-export',
  formatVersion: 1,
  sectionCount: 30,
  recordCount: 1,
  byteLength: 64,
  sha256: 'a'.repeat(64),
};

function claim(
  overrides: Partial<AccountExportJobRecord> = {},
): AccountExportJobRecord {
  return {
    id: '123e4567-e89b-42d3-a456-426614174000',
    userId: 'owner-1',
    state: 'processing',
    active: true,
    formatVersion: 1,
    attempts: 1,
    nextAttemptAt: now,
    claimId: '123e4567-e89b-42d3-a456-426614174001',
    leaseExpiresAt: new Date(now.getTime() + 120_000),
    failureCode: null,
    failedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function fixture(input: { job?: AccountExportJobRecord | null } = {}) {
  const sink: jest.Mocked<AccountExportArtifactSink> = {
    write: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    abort: jest.fn().mockResolvedValue(undefined),
  };
  const exports = {
    claimNext: jest
      .fn()
      .mockResolvedValue(input.job === undefined ? claim() : input.job),
    renewLease: jest.fn().mockResolvedValue(true),
    captureStudyProgressExportEpoch: jest.fn().mockResolvedValue(7),
    assertStudyProgressExportEpoch: jest.fn().mockResolvedValue(undefined),
    complete: jest.fn().mockResolvedValue(true),
    reschedule: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<AccountExportService>;
  const assembler = {
    writeJsonV3: jest.fn<
      Promise<AccountExportAssemblyResult>,
      Parameters<AccountExportAssembler['writeJsonV3']>
    >().mockImplementation(async (_userId: string, targetSink: AccountExportArtifactSink) => {
      const v3Result: AccountExportAssemblyResult = {
        ...result, formatVersion: 3, sectionCount: 32,
      };
      await targetSink.write('export-v3');
      await targetSink.commit(v3Result);
      return v3Result;
    }),
    writeJsonV2: jest.fn<
      Promise<AccountExportAssemblyResult>,
      Parameters<AccountExportAssembler['writeJsonV2']>
    >().mockImplementation(async (_userId: string, targetSink: AccountExportArtifactSink) => {
      const v2Result: AccountExportAssemblyResult = {
        ...result, formatVersion: 2, sectionCount: 31,
      };
      await targetSink.write('export-v2');
      await targetSink.commit(v2Result);
      return v2Result;
    }),
    writeJsonV1: jest
      .fn<
        Promise<AccountExportAssemblyResult>,
        Parameters<AccountExportAssembler['writeJsonV1']>
      >()
      .mockImplementation(
        async (_userId: string, targetSink: AccountExportArtifactSink) => {
          await targetSink.write('export');
          await targetSink.commit(result);
          return result;
        },
      ),
  } as unknown as jest.Mocked<AccountExportAssembler>;
  const store = {
    findOwned: jest.fn().mockResolvedValue(null),
    findExpiredArtifacts: jest.fn().mockResolvedValue([]),
    clearExpiredArtifact: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<AccountExportStore>;
  const orphans = {
    enqueue: jest.fn().mockResolvedValue(undefined),
    claimNext: jest.fn().mockResolvedValue(null),
    acknowledge: jest.fn().mockResolvedValue(true),
    retry: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<AccountExportOrphanCleanupStore>;
  const artifacts = {
    createSink: jest.fn().mockReturnValue(sink),
    deleteArtifact: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AccountExportArtifactStorage>;

  return {
    sink,
    exports,
    assembler,
    store,
    artifacts,
    orphans,
    processor: new AccountExportProcessor(exports, assembler, store, artifacts, orphans),
  };
}

describe('AccountExportProcessor', () => {
  afterEach(() => jest.useRealTimers());

  it('commits the attempt-scoped artifact before fenced job completion', async () => {
    const f = fixture();

    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1,
      completed: 1,
      retryScheduled: 0,
      failed: 0,
      expiredDeleted: 0,
    });
    expect(f.artifacts.createSink.mock.calls).toEqual([
      [claim().id, claim().claimId],
    ]);
    expect(f.assembler.writeJsonV1.mock.calls).toEqual([
      ['owner-1', f.sink, expect.any(Function)],
    ]);
    expect(f.exports.complete.mock.calls).toEqual([
      [{ id: claim().id, claimId: claim().claimId, result }],
    ]);
    expect(f.exports.reschedule.mock.calls).toHaveLength(0);
  });

  it('recovers an abandoned claim after a worker restarts', async () => {
    jest.useFakeTimers().setSystemTime(now);
    let persisted = claim({
      state: 'pending',
      attempts: 0,
      claimId: null,
      leaseExpiresAt: null,
    });
    const store = {
      findExpiredArtifacts: jest.fn().mockResolvedValue([]),
      clearExpiredArtifact: jest.fn().mockResolvedValue(true),
      claimNext: jest.fn(
        (input: { now: Date; claimId: string; leaseExpiresAt: Date }) => {
          const duePending =
            persisted.state === 'pending' &&
            persisted.nextAttemptAt.getTime() <= input.now.getTime();
          const abandonedClaim =
            persisted.state === 'processing' &&
            (persisted.leaseExpiresAt?.getTime() ?? Infinity) <=
              input.now.getTime();
          if (!persisted.active || (!duePending && !abandonedClaim))
            return Promise.resolve(null);

          persisted = {
            ...persisted,
            state: 'processing',
            attempts: persisted.attempts + 1,
            claimId: input.claimId,
            leaseExpiresAt: input.leaseExpiresAt,
            failureCode: null,
            failedAt: null,
          };
          return Promise.resolve({ ...persisted });
        },
      ),
      complete: jest.fn(
        (input: {
          id: string;
          claimId: string;
          completedAt: Date;
          artifactGeneration: string;
          artifactExpiresAt: Date;
          result: AccountExportAssemblyResult;
        }) => {
          if (
            persisted.id !== input.id ||
            !persisted.active ||
            persisted.state !== 'processing' ||
            persisted.claimId !== input.claimId ||
            (persisted.leaseExpiresAt?.getTime() ?? -Infinity) <=
              input.completedAt.getTime()
          ) {
            return Promise.resolve(false);
          }
          persisted = {
            ...persisted,
            state: 'completed',
            active: false,
            claimId: null,
            leaseExpiresAt: null,
            completedAt: input.completedAt,
            artifactGeneration: input.artifactGeneration,
            artifactExpiresAt: input.artifactExpiresAt,
            artifactSectionCount: input.result.sectionCount,
            artifactRecordCount: input.result.recordCount,
            artifactByteLength: input.result.byteLength,
            artifactSha256: input.result.sha256,
          };
          return Promise.resolve(true);
        },
      ),
    } as unknown as jest.Mocked<AccountExportStore>;
    const users = { hasActiveAccount: jest.fn().mockResolvedValue(true) };
    const firstService = new AccountExportService(store, users as never);

    // Simulate process exit immediately after the database claim is persisted.
    const abandoned = await firstService.claimNext();
    expect(abandoned).toMatchObject({ attempts: 1, state: 'processing' });
    expect(abandoned?.claimId).toBeTruthy();
    expect(abandoned?.leaseExpiresAt).toEqual(
      new Date(now.getTime() + ACCOUNT_EXPORT_LEASE_DURATION_MS),
    );

    jest.setSystemTime(abandoned!.leaseExpiresAt!);
    const f = fixture({ job: null });
    const restartedService = new AccountExportService(store, users as never);
    const restartedProcessor = new AccountExportProcessor(
      restartedService,
      f.assembler,
      store,
      f.artifacts,
      f.orphans,
    );

    await expect(restartedProcessor.runIteration()).resolves.toMatchObject({
      claimed: 1,
      completed: 1,
      retryScheduled: 0,
      stale: 0,
    });

    expect(store.claimNext.mock.calls).toHaveLength(2);
    expect(persisted).toMatchObject({
      state: 'completed',
      active: false,
      attempts: 2,
      claimId: null,
      leaseExpiresAt: null,
      artifactGeneration: f.artifacts.createSink.mock.calls[0]?.[1],
      artifactSha256: result.sha256,
    });
    expect(persisted.artifactGeneration).not.toBe(abandoned?.claimId);
  });

  it('schedules transient failures with bounded backoff and aborts staging', async () => {
    const f = fixture();
    jest.useFakeTimers().setSystemTime(now);
    f.assembler.writeJsonV1.mockRejectedValueOnce(new Error('private content'));

    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1,
      retryScheduled: 1,
      completed: 0,
    });
    expect(f.sink.abort.mock.calls).toHaveLength(1);
    expect(f.exports.reschedule.mock.calls).toEqual([
      [
        {
          id: claim().id,
          claimId: claim().claimId,
          state: 'pending',
          nextAttemptAt: new Date(now.getTime() + 30_000),
          failureCode: 'EXPORT_ASSEMBLY_RETRY',
        },
      ],
    ]);
  });

  it('makes the fifth transient failure terminal with no further backoff', async () => {
    const f = fixture({ job: claim({ attempts: 5 }) });
    jest.useFakeTimers().setSystemTime(now);
    f.assembler.writeJsonV1.mockRejectedValueOnce(new Error('provider error'));

    await expect(f.processor.runIteration()).resolves.toMatchObject({
      failed: 1,
      retryScheduled: 0,
    });
    expect(f.exports.reschedule.mock.calls).toEqual([
      [
        {
          id: claim().id,
          claimId: claim().claimId,
          state: 'failed',
          nextAttemptAt: now,
          failureCode: 'EXPORT_RETRY_EXHAUSTED',
        },
      ],
    ]);
  });

  it('terminally records an owner that became inactive before artifact commit', async () => {
    const f = fixture();
    f.assembler.writeJsonV1.mockRejectedValueOnce(
      new ForbiddenException({
        code: 'ACCOUNT_EXPORT_ACCOUNT_INACTIVE',
        message: 'inactive',
      }),
    );

    await expect(f.processor.runIteration()).resolves.toMatchObject({
      failed: 1,
    });
    expect(f.exports.reschedule.mock.calls).toEqual([
      [
        expect.objectContaining({
          state: 'failed',
          failureCode: 'ACCOUNT_EXPORT_ACCOUNT_INACTIVE',
        }),
      ],
    ]);
  });

  it('renews long-running claims and deletes a completed but fenced stale artifact', async () => {
    const f = fixture();
    let finishAssembly!: (value: AccountExportAssemblyResult) => void;
    f.assembler.writeJsonV1.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishAssembly = resolve;
        }),
    );
    f.exports.complete.mockResolvedValueOnce(false);
    jest.useFakeTimers().setSystemTime(now);

    const iteration = f.processor.runIteration();
    await jest.advanceTimersByTimeAsync(40_000);
    expect(f.exports.renewLease.mock.calls).toEqual([
      [{ id: claim().id, claimId: claim().claimId }],
    ]);
    finishAssembly(result);

    await expect(iteration).resolves.toMatchObject({ stale: 1 });
    expect(f.artifacts.deleteArtifact.mock.calls).toEqual([
      [claim().id, claim().claimId],
    ]);
  });

  it('deletes the committed attempt generation if the lease is lost after artifact assembly', async () => {
    const f = fixture();
    let resolveAssembly!: (value: AccountExportAssemblyResult) => void;
    f.assembler.writeJsonV1.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAssembly = resolve;
        }),
    );
    f.exports.renewLease.mockResolvedValueOnce(false);
    jest.useFakeTimers().setSystemTime(now);

    const iteration = f.processor.runIteration();
    await jest.advanceTimersByTimeAsync(40_000);
    expect(f.exports.renewLease.mock.calls).toContainEqual([
      { id: claim().id, claimId: claim().claimId },
    ]);
    resolveAssembly(result);

    await expect(iteration).resolves.toMatchObject({
      stale: 1,
      completed: 0,
      failed: 0,
    });
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(1);
    expect(f.artifacts.deleteArtifact.mock.calls).toContainEqual([
      claim().id,
      claim().claimId,
    ]);
    expect(f.exports.complete.mock.calls).toHaveLength(0);
    expect(f.sink.abort.mock.calls).toHaveLength(0);
  });

  it('keeps a stale lease result when deleting its committed orphan temporarily fails', async () => {
    const f = fixture();
    let resolveAssembly!: (value: AccountExportAssemblyResult) => void;
    f.assembler.writeJsonV1.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAssembly = resolve;
        }),
    );
    f.exports.renewLease.mockResolvedValueOnce(false);
    f.artifacts.deleteArtifact.mockRejectedValueOnce(
      new Error('private provider cleanup failure'),
    );
    jest.useFakeTimers().setSystemTime(now);

    const iteration = f.processor.runIteration();
    await jest.advanceTimersByTimeAsync(40_000);
    resolveAssembly(result);
    await expect(iteration).resolves.toMatchObject({ stale: 1 });
    expect(f.artifacts.deleteArtifact.mock.calls).toContainEqual([
      claim().id,
      claim().claimId,
    ]);
    expect(f.exports.complete.mock.calls).toHaveLength(0);
    expect(f.exports.reschedule.mock.calls).toHaveLength(0);
  });

  it('retries expired artifact deletion without clearing its durable generation', async () => {
    const f = fixture({ job: null });
    const expiresAt = new Date(now.getTime() - 1);
    f.store.findExpiredArtifacts.mockResolvedValueOnce([
      { id: claim().id, generation: claim().claimId!, expiresAt },
    ]);
    f.artifacts.deleteArtifact.mockRejectedValueOnce(new Error('storage down'));

    await expect(f.processor.runIteration()).resolves.toMatchObject({
      expiredDeleted: 0,
      expirationRetries: 1,
      claimed: 0,
    });
    expect(f.store.clearExpiredArtifact.mock.calls).toHaveLength(0);
  });

  it('routes a persisted v2 job to the v2 assembler without rewriting its format', async () => {
    const f = fixture({ job: claim({ formatVersion: 2 }) });
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1, completed: 1, retryScheduled: 0,
    });
    expect(f.assembler.writeJsonV1).not.toHaveBeenCalled();
    expect(f.assembler.writeJsonV2).toHaveBeenCalledWith(
      'owner-1', f.sink, expect.any(Function),
    );
    expect(f.exports.complete).toHaveBeenCalledWith({
      id: claim().id,
      claimId: claim().claimId,
      result: expect.objectContaining({
        formatVersion: 2, sectionCount: 31,
      }),
    });
  });

  it('B64 retries a stale v3 progress snapshot without publishing', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    f.assembler.writeJsonV3.mockRejectedValueOnce(
      new Error('Study progress changed during account export'),
    );
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1, retryScheduled: 1, completed: 0,
    });
    expect(f.sink.abort).toHaveBeenCalled();
    expect(f.exports.complete).not.toHaveBeenCalled();
    expect(f.exports.reschedule).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'pending', failureCode: 'EXPORT_ASSEMBLY_RETRY',
      }),
    );
  });

  it('B64 exhausts stale v3 snapshots without publishing a partial artifact', async () => {
    const f = fixture({ job: claim({ formatVersion: 3, attempts: 5 }) });
    f.assembler.writeJsonV3.mockRejectedValueOnce(
      new Error('Study progress changed during account export'),
    );
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1, retryScheduled: 0, failed: 1, completed: 0,
    });
    expect(f.exports.complete).not.toHaveBeenCalled();
    expect(f.exports.reschedule).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'failed', failureCode: 'EXPORT_RETRY_EXHAUSTED',
      }),
    );
  });

  it('B65: rejects a v3 mutation after S3 commit but before durable job completion', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    f.exports.assertStudyProgressExportEpoch.mockRejectedValueOnce(
      new Error('Study progress changed during account export'),
    );
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1, retryScheduled: 1, completed: 0, failed: 0,
    });
    expect(f.sink.commit).toHaveBeenCalledTimes(1);
    expect(f.exports.captureStudyProgressExportEpoch)
      .toHaveBeenCalledWith('owner-1');
    expect(f.exports.assertStudyProgressExportEpoch)
      .toHaveBeenCalledWith('owner-1', 7);
    expect(f.exports.complete).not.toHaveBeenCalled();
    expect(f.artifacts.deleteArtifact).toHaveBeenCalledWith(
      claim().id, claim().claimId,
    );
    expect(f.sink.abort).not.toHaveBeenCalled();
    expect(f.exports.reschedule).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'pending', failureCode: 'EXPORT_ASSEMBLY_RETRY',
      }),
    );
  });

  it('B65: preserves committed artifact ordering for a stable v3 epoch', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      completed: 1, retryScheduled: 0,
    });
    const s3Commit = f.sink.commit.mock.invocationCallOrder[0];
    const epochRead = f.exports.captureStudyProgressExportEpoch.mock.invocationCallOrder[0];
    const epochCheck = f.exports.assertStudyProgressExportEpoch.mock.invocationCallOrder[0];
    const durableCommit = f.exports.complete.mock.invocationCallOrder[0];
    expect(epochRead).toBeLessThan(s3Commit);
    expect(s3Commit).toBeLessThan(epochCheck);
    expect(epochCheck).toBeLessThan(durableCommit);
    expect(f.artifacts.deleteArtifact).not.toHaveBeenCalled();
  });

  it('B65: retries after a postcommit epoch probe outage and attempts cleanup', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    const error = new Error('Mongo owner revision unavailable');
    f.exports.assertStudyProgressExportEpoch.mockRejectedValueOnce(error);
    f.artifacts.deleteArtifact.mockRejectedValueOnce(
      new Error('S3 cleanup temporarily unavailable'),
    );
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1, retryScheduled: 1, completed: 0,
    });
    expect(f.artifacts.deleteArtifact).toHaveBeenCalledWith(
      claim().id, claim().claimId,
    );
    expect(f.exports.complete).not.toHaveBeenCalled();
    expect(f.exports.reschedule).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: 'EXPORT_ASSEMBLY_RETRY' }),
    );
  });

  it('B65: cleans S3 after a confirmed atomic Mongo epoch rejection', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    f.exports.complete.mockRejectedValueOnce(new AccountExportEpochConflictError());
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1, completed: 0, retryScheduled: 1,
    });
    expect(f.exports.complete).toHaveBeenCalledTimes(1);
    expect(f.artifacts.deleteArtifact).toHaveBeenCalledWith(
      claim().id, claim().claimId,
    );
    expect(f.exports.reschedule).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: 'EXPORT_ASSEMBLY_RETRY' }),
    );
  });

  it('B65: never deletes S3 on an uncertain durable Mongo completion', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    f.exports.complete.mockRejectedValueOnce(
      new Error('Mongo acknowledged a write but the reply was lost'),
    );
    f.exports.reschedule.mockResolvedValueOnce(false);
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      stale: 1, completed: 0,
    });
    expect(f.sink.commit).toHaveBeenCalledTimes(1);
    expect(f.exports.complete).toHaveBeenCalledTimes(1);
    expect(f.artifacts.deleteArtifact).not.toHaveBeenCalled();
    expect(f.sink.abort).not.toHaveBeenCalled();
  });

  function completedAttempt(
    overrides: Partial<AccountExportJobRecord> = {},
  ): AccountExportJobRecord {
    return claim({
      state: 'completed', active: false, claimId: null,
      formatVersion: 3, completedAt: now,
      artifactGeneration: claim().claimId,
      artifactSectionCount: 32, artifactRecordCount: 1,
      artifactByteLength: 64, artifactSha256: 'a'.repeat(64),
      ...overrides,
    });
  }

  it.each([1, 2] as const)(
    'B66 also reconciles lost acknowledgements for historical v%s without new epoch reads',
    async (version) => {
      const f = fixture({ job: claim({ formatVersion: version }) });
      f.exports.complete.mockRejectedValueOnce(new Error('commit ack lost'));
      f.store.findOwned.mockResolvedValueOnce(claim({
        state: 'completed', active: false, claimId: null,
        completedAt: now, formatVersion: version,
        artifactGeneration: claim().claimId,
        artifactSectionCount: version === 1 ? 30 : 31,
        artifactRecordCount: 1, artifactByteLength: 64,
        artifactSha256: 'a'.repeat(64),
      }));
      await expect(f.processor.runIteration()).resolves.toMatchObject({
        completed: 1, retryScheduled: 0,
      });
      expect(f.exports.captureStudyProgressExportEpoch).not.toHaveBeenCalled();
      expect(f.exports.reschedule).not.toHaveBeenCalled();
      expect(f.artifacts.deleteArtifact).not.toHaveBeenCalled();
    },
  );

  it('B66 reconciles a lost Mongo acknowledgement to the real completed generation', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    f.exports.complete.mockRejectedValueOnce(
      new Error('Mongo committed but client lost the response'),
    );
    f.store.findOwned.mockResolvedValueOnce(completedAttempt());
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1, completed: 1, stale: 0, retryScheduled: 0,
    });
    expect(f.store.findOwned).toHaveBeenCalledWith(claim().id, 'owner-1');
    expect(f.exports.reschedule).not.toHaveBeenCalled();
    expect(f.artifacts.deleteArtifact).not.toHaveBeenCalled();
    expect(f.sink.abort).not.toHaveBeenCalled();
  });

  it('B66 rechecks after a lost reschedule CAS and recovers late Mongo completion', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    f.exports.complete.mockRejectedValueOnce(new Error('response lost'));
    f.store.findOwned.mockResolvedValueOnce(null).mockResolvedValueOnce(completedAttempt());
    f.exports.reschedule.mockResolvedValueOnce(false);
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1, completed: 1, retryScheduled: 0,
    });
    expect(f.store.findOwned).toHaveBeenCalledTimes(2);
    expect(f.exports.reschedule).toHaveBeenCalledTimes(1);
    expect(f.artifacts.deleteArtifact).not.toHaveBeenCalled();
  });

  it('B66 deletes orphaned S3 only AFTER retry CAS proves noncompletion', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    f.exports.complete.mockRejectedValueOnce(new Error('response lost'));
    f.store.findOwned.mockResolvedValue(null);
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1, retryScheduled: 1, completed: 0,
    });
    expect(f.exports.reschedule).toHaveBeenCalledTimes(1);
    expect(f.artifacts.deleteArtifact).toHaveBeenCalledWith(claim().id, claim().claimId);
    expect(f.exports.reschedule.mock.invocationCallOrder[0])
      .toBeLessThan(f.artifacts.deleteArtifact.mock.invocationCallOrder[0]);
    expect(f.store.findOwned).toHaveBeenCalledTimes(1);
  });

  it('B66 preserves S3 when claim outcome is unknown and CAS is lost', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    f.exports.complete.mockRejectedValueOnce(new Error('unknown write concern'));
    f.exports.reschedule.mockResolvedValueOnce(false);
    f.store.findOwned.mockResolvedValue(null);
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1, stale: 1, completed: 0,
    });
    expect(f.store.findOwned).toHaveBeenCalledTimes(2);
    expect(f.artifacts.deleteArtifact).not.toHaveBeenCalled();
  });

  it('B66 ignores a completed export from another owner or another S3 generation', async () => {
    for (const foreign of [
      completedAttempt({ userId: 'another-owner' }),
      completedAttempt({ artifactGeneration: 'another-generation' }),
      completedAttempt({ artifactSha256: 'b'.repeat(64) }),
      completedAttempt({ artifactSectionCount: 31 }),
      completedAttempt({ active: true }),
      completedAttempt({ completedAt: null }),
    ]) {
      const f = fixture({ job: claim({ formatVersion: 3 }) });
      f.exports.complete.mockRejectedValueOnce(new Error('unknown Mongo completion'));
      f.store.findOwned.mockResolvedValue(foreign);
      f.exports.reschedule.mockResolvedValueOnce(false);
      await expect(f.processor.runIteration()).resolves.toMatchObject({
        stale: 1, completed: 0,
      });
      expect(f.artifacts.deleteArtifact).not.toHaveBeenCalled();
    }
  });

  it('B66 retries and safely deletes an orphan when its first reconciliation read fails', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    f.exports.complete.mockRejectedValueOnce(new Error('Mongo timeout'));
    f.store.findOwned.mockRejectedValueOnce(new Error('read unavailable'));
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1, retryScheduled: 1, completed: 0,
    });
    expect(f.artifacts.deleteArtifact).toHaveBeenCalledWith(claim().id, claim().claimId);
  });

  it('B66 never deletes S3 if the reconciliation CAS itself fails', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    f.exports.complete.mockRejectedValueOnce(
      new Error('Mongo completion acknowledgement unknown'),
    );
    f.store.findOwned.mockRejectedValueOnce(new Error('Mongo read unavailable'));
    f.exports.reschedule.mockRejectedValueOnce(new Error('Mongo retry CAS unavailable'));
    await expect(f.processor.runIteration()).rejects.toThrow(
      'Mongo retry CAS unavailable',
    );
    expect(f.artifacts.deleteArtifact).not.toHaveBeenCalled();
    expect(f.sink.abort).not.toHaveBeenCalled();
  });

  it('B66 preserves S3 if both reconciliation reads are unavailable and CAS loses', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    f.exports.complete.mockRejectedValueOnce(new Error('Mongo completion unknown'));
    f.store.findOwned.mockRejectedValue(new Error('Mongo reader unavailable'));
    f.exports.reschedule.mockResolvedValueOnce(false);
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      stale: 1, completed: 0, retryScheduled: 0,
    });
    expect(f.store.findOwned).toHaveBeenCalledTimes(2);
    expect(f.artifacts.deleteArtifact).not.toHaveBeenCalled();
  });

  it('B66 retains a durable retry outcome when S3 orphan cleanup fails', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    f.exports.complete.mockRejectedValueOnce(new Error('Mongo response unknown'));
    f.store.findOwned.mockResolvedValue(null);
    f.artifacts.deleteArtifact.mockRejectedValueOnce(new Error('S3 not reachable'));
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      retryScheduled: 1, completed: 0, stale: 0,
    });
    expect(f.exports.reschedule).toHaveBeenCalledTimes(1);
    expect(f.artifacts.deleteArtifact).toHaveBeenCalledTimes(1);
  });

  it('B66 reconciles unknown completion at retry exhaustion without false failure', async () => {
    const f = fixture({ job: claim({ formatVersion: 3, attempts: 5 }) });
    f.exports.complete.mockRejectedValueOnce(new Error('lost commit acknowledgement'));
    f.store.findOwned.mockResolvedValueOnce(completedAttempt());
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      completed: 1, failed: 0,
    });
    expect(f.exports.reschedule).not.toHaveBeenCalled();
  });

  it('B66 deletes a confirmed stale generation without requiring a retry CAS', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    f.exports.complete.mockResolvedValueOnce(false);
    f.artifacts.deleteArtifact.mockRejectedValueOnce(new Error('S3 unavailable'));
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      stale: 1, completed: 0,
    });
    expect(f.exports.reschedule).not.toHaveBeenCalled();
    expect(f.artifacts.deleteArtifact).toHaveBeenCalledWith(claim().id, claim().claimId);
  });

  it('B65: does not publish a stale v3 even at retry exhaustion', async () => {
    const f = fixture({ job: claim({ formatVersion: 3, attempts: 5 }) });
    f.exports.assertStudyProgressExportEpoch.mockRejectedValueOnce(
      new Error('Study progress changed during account export'),
    );
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      failed: 1, completed: 0, retryScheduled: 0,
    });
    expect(f.artifacts.deleteArtifact).toHaveBeenCalledWith(
      claim().id, claim().claimId,
    );
    expect(f.exports.complete).not.toHaveBeenCalled();
    expect(f.exports.reschedule).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'failed', failureCode: 'EXPORT_RETRY_EXHAUSTED',
      }),
    );
  });

  it('B65: never adds epoch lookups to historical v1 or v2 jobs', async () => {
    for (const version of [1, 2]) {
      const f = fixture({ job: claim({ formatVersion: version }) });
      await expect(f.processor.runIteration()).resolves.toMatchObject({
        claimed: 1, completed: 1,
      });
      expect(f.exports.captureStudyProgressExportEpoch).not.toHaveBeenCalled();
      expect(f.exports.assertStudyProgressExportEpoch).not.toHaveBeenCalled();
    }
  });

  it('routes persisted v3 jobs to the v3 assembler without modifying legacy claims', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1, completed: 1, retryScheduled: 0,
    });
    expect(f.assembler.writeJsonV1).not.toHaveBeenCalled();
    expect(f.assembler.writeJsonV2).not.toHaveBeenCalled();
    expect(f.assembler.writeJsonV3).toHaveBeenCalledWith(
      'owner-1', f.sink, expect.any(Function),
    );
    expect(f.exports.complete).toHaveBeenCalledWith({
      id: claim().id,
      claimId: claim().claimId,
      ownerUserId: 'owner-1',
      expectedProgressEpoch: 7,
      result: expect.objectContaining({
        formatVersion: 3, sectionCount: 32,
      }),
    });
  });

  it('fails closed on unsupported persisted versions before publishing a file', async () => {
    const f = fixture({ job: claim({ formatVersion: 99 }) });
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1, retryScheduled: 1, completed: 0,
    });
    expect(f.assembler.writeJsonV1).not.toHaveBeenCalled();
    expect(f.assembler.writeJsonV2).not.toHaveBeenCalled();
    expect(f.assembler.writeJsonV3).not.toHaveBeenCalled();
    expect(f.sink.abort).toHaveBeenCalled();
    expect(f.exports.complete).not.toHaveBeenCalled();
  });

});
