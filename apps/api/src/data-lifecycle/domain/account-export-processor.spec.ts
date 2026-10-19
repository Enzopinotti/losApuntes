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

// Jest asymmetric predicates are runtime matchers but are typed as any.
// Keep nested assertions opaque without changing their actual behavior.
const expectedDate: unknown = expect.any(Date);
const expectedV2Artifact: unknown = expect.objectContaining({
  formatVersion: 2,
  sectionCount: 31,
});
const expectedV3Artifact: unknown = expect.objectContaining({
  formatVersion: 3,
  sectionCount: 32,
});

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
    writeJsonV3: jest
      .fn<
        Promise<AccountExportAssemblyResult>,
        Parameters<AccountExportAssembler['writeJsonV3']>
      >()
      .mockImplementation(
        async (_userId: string, targetSink: AccountExportArtifactSink) => {
          const v3Result: AccountExportAssemblyResult = {
            ...result,
            formatVersion: 3,
            sectionCount: 32,
          };
          await targetSink.write('export-v3');
          await targetSink.commit(v3Result);
          return v3Result;
        },
      ),
    writeJsonV2: jest
      .fn<
        Promise<AccountExportAssemblyResult>,
        Parameters<AccountExportAssembler['writeJsonV2']>
      >()
      .mockImplementation(
        async (_userId: string, targetSink: AccountExportArtifactSink) => {
          const v2Result: AccountExportAssemblyResult = {
            ...result,
            formatVersion: 2,
            sectionCount: 31,
          };
          await targetSink.write('export-v2');
          await targetSink.commit(v2Result);
          return v2Result;
        },
      ),
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
    isOwnedArtifactCurrent: jest.fn().mockResolvedValue(false),
    findForOrphanCleanup: jest.fn().mockResolvedValue(
      claim({
        state: 'pending',
        active: true,
        claimId: null,
      }),
    ),
    fenceExpiredClaimForOrphanCleanup: jest.fn().mockResolvedValue(true),
    findExpiredArtifacts: jest.fn().mockResolvedValue([]),
    retireExpiredArtifact: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<AccountExportStore>;
  const orphans = {
    enqueue: jest.fn().mockResolvedValue(undefined),
    claimNext: jest.fn().mockResolvedValue(null),
    renewLease: jest.fn().mockResolvedValue(true),
    clearPending: jest.fn().mockResolvedValue(true),
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
    processor: new AccountExportProcessor(
      exports,
      assembler,
      store,
      artifacts,
      orphans,
    ),
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
      retireExpiredArtifact: jest.fn().mockResolvedValue(true),
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

  it('renews long-running claims and queues a fenced stale artifact', async () => {
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
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
  });

  it('queues the committed attempt generation after lease loss', async () => {
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
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.orphans.enqueue.mock.calls).toHaveLength(1);
    expect(f.exports.complete.mock.calls).toHaveLength(0);
    expect(f.sink.abort.mock.calls).toHaveLength(0);
  });

  it('keeps stale result when recording orphan cleanup temporarily fails', async () => {
    const f = fixture();
    let resolveAssembly!: (value: AccountExportAssemblyResult) => void;
    f.assembler.writeJsonV1.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAssembly = resolve;
        }),
    );
    f.exports.renewLease.mockResolvedValueOnce(false);
    f.orphans.enqueue.mockRejectedValueOnce(
      new Error('Mongo orphan queue failure'),
    );
    jest.useFakeTimers().setSystemTime(now);

    const iteration = f.processor.runIteration();
    await jest.advanceTimersByTimeAsync(40_000);
    resolveAssembly(result);
    await jest.advanceTimersByTimeAsync(200);
    await expect(iteration).resolves.toMatchObject({
      stale: 1,
      orphanEnqueueRetries: 1,
      orphanEnqueueRecovered: 1,
      orphanEnqueueFailures: 0,
    });
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.exports.complete.mock.calls).toHaveLength(0);
    expect(f.exports.reschedule.mock.calls).toHaveLength(0);
  });

  it('B72 retires expired export to durable cleanup queue before any S3 delete', async () => {
    const f = fixture({ job: null });
    const expiresAt = new Date(now.getTime() - 1);
    f.store.findExpiredArtifacts.mockResolvedValueOnce([
      { id: claim().id, generation: claim().claimId!, expiresAt },
    ]);
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      expiredRetired: 1,
      expiredDeleted: 0,
      expirationRetries: 0,
      claimed: 0,
    });
    expect(f.store.retireExpiredArtifact.mock.calls).toContainEqual([
      {
        id: claim().id,
        generation: claim().claimId!,
        expiresAt,
        now: expectedDate,
      },
    ]);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.orphans.enqueue.mock.calls).toHaveLength(0);
  });

  it('B72 handles expiry CAS loss without deleting S3 or stalling exports', async () => {
    const f = fixture();
    const expiresAt = new Date(now.getTime() - 1);
    f.store.findExpiredArtifacts.mockResolvedValueOnce([
      { id: claim().id, generation: claim().claimId!, expiresAt },
    ]);
    f.store.retireExpiredArtifact.mockResolvedValueOnce(false);
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      expiredRetired: 0,
      expirationStale: 1,
      expiredDeleted: 0,
      completed: 1,
    });
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.exports.complete.mock.calls).toHaveLength(1);
  });

  it('B72 survives an expired-sweep Mongo read outage and continues new exports', async () => {
    const f = fixture();
    f.store.findExpiredArtifacts.mockRejectedValueOnce(
      new Error('Mongo read outage'),
    );
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      expirationRetries: 1,
      expiredRetired: 0,
      completed: 1,
    });
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.exports.complete.mock.calls).toHaveLength(1);
  });

  it('B72 leaves S3 untouched after a transactional retirement exception', async () => {
    const f = fixture();
    const expiresAt = new Date(now.getTime() - 1);
    f.store.findExpiredArtifacts.mockResolvedValueOnce([
      { id: claim().id, generation: claim().claimId!, expiresAt },
    ]);
    f.store.retireExpiredArtifact.mockRejectedValueOnce(
      new Error('Mongo commit acknowledgement unknown'),
    );
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      expirationRetries: 1,
      expiredRetired: 0,
      completed: 1,
    });
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.orphans.enqueue.mock.calls).toHaveLength(0);
  });

  it('routes a persisted v2 job to the v2 assembler without rewriting its format', async () => {
    const f = fixture({ job: claim({ formatVersion: 2 }) });
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1,
      completed: 1,
      retryScheduled: 0,
    });
    expect(f.assembler.writeJsonV1.mock.calls).toHaveLength(0);
    expect(f.assembler.writeJsonV2.mock.calls).toContainEqual([
      'owner-1',
      f.sink,
      expect.any(Function),
    ]);
    expect(f.exports.complete.mock.calls).toContainEqual([
      {
        id: claim().id,
        claimId: claim().claimId,
        result: expectedV2Artifact,
      },
    ]);
  });

  it('B64 retries a stale v3 progress snapshot without publishing', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    f.assembler.writeJsonV3.mockRejectedValueOnce(
      new Error('Study progress changed during account export'),
    );
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1,
      retryScheduled: 1,
      completed: 0,
    });
    expect(f.sink.abort.mock.calls.length).toBeGreaterThan(0);
    expect(f.exports.complete.mock.calls).toHaveLength(0);
    expect(f.exports.reschedule.mock.calls).toContainEqual([
      expect.objectContaining({
        state: 'pending',
        failureCode: 'EXPORT_ASSEMBLY_RETRY',
      }),
    ]);
  });

  it('B64 exhausts stale v3 snapshots without publishing a partial artifact', async () => {
    const f = fixture({ job: claim({ formatVersion: 3, attempts: 5 }) });
    f.assembler.writeJsonV3.mockRejectedValueOnce(
      new Error('Study progress changed during account export'),
    );
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1,
      retryScheduled: 0,
      failed: 1,
      completed: 0,
    });
    expect(f.exports.complete.mock.calls).toHaveLength(0);
    expect(f.exports.reschedule.mock.calls).toContainEqual([
      expect.objectContaining({
        state: 'failed',
        failureCode: 'EXPORT_RETRY_EXHAUSTED',
      }),
    ]);
  });

  it('B65: rejects a v3 mutation after S3 commit but before durable job completion', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    f.exports.assertStudyProgressExportEpoch.mockRejectedValueOnce(
      new Error('Study progress changed during account export'),
    );
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1,
      retryScheduled: 1,
      completed: 0,
      failed: 0,
    });
    expect(f.sink.commit.mock.calls).toHaveLength(1);
    expect(f.exports.captureStudyProgressExportEpoch.mock.calls).toContainEqual(
      ['owner-1'],
    );
    expect(f.exports.assertStudyProgressExportEpoch.mock.calls).toContainEqual([
      'owner-1',
      7,
    ]);
    expect(f.exports.complete.mock.calls).toHaveLength(0);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.sink.abort.mock.calls).toHaveLength(0);
    expect(f.exports.reschedule.mock.calls).toContainEqual([
      expect.objectContaining({
        state: 'pending',
        failureCode: 'EXPORT_ASSEMBLY_RETRY',
      }),
    ]);
  });

  it('B65: preserves committed artifact ordering for a stable v3 epoch', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      completed: 1,
      retryScheduled: 0,
    });
    const s3Commit = f.sink.commit.mock.invocationCallOrder[0];
    const epochRead =
      f.exports.captureStudyProgressExportEpoch.mock.invocationCallOrder[0];
    const epochCheck =
      f.exports.assertStudyProgressExportEpoch.mock.invocationCallOrder[0];
    const durableCommit = f.exports.complete.mock.invocationCallOrder[0];
    expect(epochRead).toBeLessThan(s3Commit);
    expect(s3Commit).toBeLessThan(epochCheck);
    expect(epochCheck).toBeLessThan(durableCommit);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
  });

  it('B65: retries after a postcommit epoch probe outage and queues cleanup', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    const error = new Error('Mongo owner revision unavailable');
    f.exports.assertStudyProgressExportEpoch.mockRejectedValueOnce(error);
    f.orphans.enqueue.mockRejectedValueOnce(
      new Error('Mongo orphan queue temporarily unavailable'),
    );
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1,
      retryScheduled: 1,
      completed: 0,
    });
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.exports.complete.mock.calls).toHaveLength(0);
    expect(f.exports.reschedule.mock.calls).toContainEqual([
      expect.objectContaining({ failureCode: 'EXPORT_ASSEMBLY_RETRY' }),
    ]);
  });

  it('B65: queues S3 cleanup after a confirmed atomic Mongo epoch rejection', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    f.exports.complete.mockRejectedValueOnce(
      new AccountExportEpochConflictError(),
    );
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1,
      completed: 0,
      retryScheduled: 1,
    });
    expect(f.exports.complete.mock.calls).toHaveLength(1);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.exports.reschedule.mock.calls).toContainEqual([
      expect.objectContaining({ failureCode: 'EXPORT_ASSEMBLY_RETRY' }),
    ]);
  });

  it('B65: never deletes S3 on an uncertain durable Mongo completion', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    f.exports.complete.mockRejectedValueOnce(
      new Error('Mongo acknowledged a write but the reply was lost'),
    );
    f.exports.reschedule.mockResolvedValueOnce(false);
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      stale: 1,
      completed: 0,
    });
    expect(f.sink.commit.mock.calls).toHaveLength(1);
    expect(f.exports.complete.mock.calls).toHaveLength(1);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.sink.abort.mock.calls).toHaveLength(0);
  });

  function completedAttempt(
    overrides: Partial<AccountExportJobRecord> = {},
  ): AccountExportJobRecord {
    return claim({
      state: 'completed',
      active: false,
      claimId: null,
      formatVersion: 3,
      completedAt: now,
      artifactGeneration: claim().claimId,
      artifactSectionCount: 32,
      artifactRecordCount: 1,
      artifactByteLength: 64,
      artifactSha256: 'a'.repeat(64),
      ...overrides,
    });
  }

  it.each([1, 2] as const)(
    'B66 also reconciles lost acknowledgements for historical v%s without new epoch reads',
    async (version) => {
      const f = fixture({ job: claim({ formatVersion: version }) });
      f.exports.complete.mockRejectedValueOnce(new Error('commit ack lost'));
      f.store.findOwned.mockResolvedValueOnce(
        claim({
          state: 'completed',
          active: false,
          claimId: null,
          completedAt: now,
          formatVersion: version,
          artifactGeneration: claim().claimId,
          artifactSectionCount: version === 1 ? 30 : 31,
          artifactRecordCount: 1,
          artifactByteLength: 64,
          artifactSha256: 'a'.repeat(64),
        }),
      );
      await expect(f.processor.runIteration()).resolves.toMatchObject({
        completed: 1,
        retryScheduled: 0,
      });
      expect(f.exports.captureStudyProgressExportEpoch.mock.calls).toHaveLength(
        0,
      );
      expect(f.exports.reschedule.mock.calls).toHaveLength(0);
      expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    },
  );

  it('B66 reconciles a lost Mongo acknowledgement to the real completed generation', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    f.exports.complete.mockRejectedValueOnce(
      new Error('Mongo committed but client lost the response'),
    );
    f.store.findOwned.mockResolvedValueOnce(completedAttempt());
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1,
      completed: 1,
      stale: 0,
      retryScheduled: 0,
    });
    expect(f.store.findOwned.mock.calls).toContainEqual([
      claim().id,
      'owner-1',
    ]);
    expect(f.exports.reschedule.mock.calls).toHaveLength(0);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.sink.abort.mock.calls).toHaveLength(0);
  });

  it('B66 rechecks after a lost reschedule CAS and recovers late Mongo completion', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    f.exports.complete.mockRejectedValueOnce(new Error('response lost'));
    f.store.findOwned
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(completedAttempt());
    f.exports.reschedule.mockResolvedValueOnce(false);
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1,
      completed: 1,
      retryScheduled: 0,
    });
    expect(f.store.findOwned.mock.calls).toHaveLength(2);
    expect(f.exports.reschedule.mock.calls).toHaveLength(1);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
  });

  it('B66 queues orphan cleanup only AFTER retry CAS proves noncompletion', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    f.exports.complete.mockRejectedValueOnce(new Error('response lost'));
    f.store.findOwned.mockResolvedValue(null);
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1,
      retryScheduled: 1,
      completed: 0,
    });
    expect(f.exports.reschedule.mock.calls).toHaveLength(1);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.exports.reschedule.mock.invocationCallOrder[0]).toBeLessThan(
      f.orphans.enqueue.mock.invocationCallOrder[0],
    );
    expect(f.store.findOwned.mock.calls).toHaveLength(1);
  });

  it('B66 preserves S3 when claim outcome is unknown and CAS is lost', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    f.exports.complete.mockRejectedValueOnce(
      new Error('unknown write concern'),
    );
    f.exports.reschedule.mockResolvedValueOnce(false);
    f.store.findOwned.mockResolvedValue(null);
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1,
      stale: 1,
      completed: 0,
    });
    expect(f.store.findOwned.mock.calls).toHaveLength(2);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
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
      f.exports.complete.mockRejectedValueOnce(
        new Error('unknown Mongo completion'),
      );
      f.store.findOwned.mockResolvedValue(foreign);
      f.exports.reschedule.mockResolvedValueOnce(false);
      await expect(f.processor.runIteration()).resolves.toMatchObject({
        stale: 1,
        completed: 0,
      });
      expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    }
  });

  it('B66 retries and safely queues an orphan when its first reconciliation read fails', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    f.exports.complete.mockRejectedValueOnce(new Error('Mongo timeout'));
    f.store.findOwned.mockRejectedValueOnce(new Error('read unavailable'));
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1,
      retryScheduled: 1,
      completed: 0,
    });
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
  });

  it('B66 never deletes S3 if the reconciliation CAS itself fails', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    f.exports.complete.mockRejectedValueOnce(
      new Error('Mongo completion acknowledgement unknown'),
    );
    f.store.findOwned.mockRejectedValueOnce(
      new Error('Mongo read unavailable'),
    );
    f.exports.reschedule.mockRejectedValueOnce(
      new Error('Mongo retry CAS unavailable'),
    );
    await expect(f.processor.runIteration()).rejects.toThrow(
      'Mongo retry CAS unavailable',
    );
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.sink.abort.mock.calls).toHaveLength(0);
  });

  it('B66 preserves S3 if both reconciliation reads are unavailable and CAS loses', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    f.exports.complete.mockRejectedValueOnce(
      new Error('Mongo completion unknown'),
    );
    f.store.findOwned.mockRejectedValue(new Error('Mongo reader unavailable'));
    f.exports.reschedule.mockResolvedValueOnce(false);
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      stale: 1,
      completed: 0,
      retryScheduled: 0,
    });
    expect(f.store.findOwned.mock.calls).toHaveLength(2);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
  });

  it('B66 retains a durable retry outcome when orphan enqueue fails', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    f.exports.complete.mockRejectedValueOnce(
      new Error('Mongo response unknown'),
    );
    f.store.findOwned.mockResolvedValue(null);
    f.orphans.enqueue.mockRejectedValueOnce(new Error('S3 not reachable'));
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      retryScheduled: 1,
      completed: 0,
      stale: 0,
    });
    expect(f.exports.reschedule.mock.calls).toHaveLength(1);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
  });

  it('B66 reconciles unknown completion at retry exhaustion without false failure', async () => {
    const f = fixture({ job: claim({ formatVersion: 3, attempts: 5 }) });
    f.exports.complete.mockRejectedValueOnce(
      new Error('lost commit acknowledgement'),
    );
    f.store.findOwned.mockResolvedValueOnce(completedAttempt());
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      completed: 1,
      failed: 0,
    });
    expect(f.exports.reschedule.mock.calls).toHaveLength(0);
  });

  it('B66 queues a confirmed stale generation without requiring a retry CAS', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    f.exports.complete.mockResolvedValueOnce(false);
    f.orphans.enqueue.mockRejectedValueOnce(new Error('S3 unavailable'));
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      stale: 1,
      completed: 0,
    });
    expect(f.exports.reschedule.mock.calls).toHaveLength(0);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
  });

  it('B65: does not publish a stale v3 even at retry exhaustion', async () => {
    const f = fixture({ job: claim({ formatVersion: 3, attempts: 5 }) });
    f.exports.assertStudyProgressExportEpoch.mockRejectedValueOnce(
      new Error('Study progress changed during account export'),
    );
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      failed: 1,
      completed: 0,
      retryScheduled: 0,
    });
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.exports.complete.mock.calls).toHaveLength(0);
    expect(f.exports.reschedule.mock.calls).toContainEqual([
      expect.objectContaining({
        state: 'failed',
        failureCode: 'EXPORT_RETRY_EXHAUSTED',
      }),
    ]);
  });

  it('B65: never adds epoch lookups to historical v1 or v2 jobs', async () => {
    for (const version of [1, 2]) {
      const f = fixture({ job: claim({ formatVersion: version }) });
      await expect(f.processor.runIteration()).resolves.toMatchObject({
        claimed: 1,
        completed: 1,
      });
      expect(f.exports.captureStudyProgressExportEpoch.mock.calls).toHaveLength(
        0,
      );
      expect(f.exports.assertStudyProgressExportEpoch.mock.calls).toHaveLength(
        0,
      );
    }
  });

  it('routes persisted v3 jobs to the v3 assembler without modifying legacy claims', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1,
      completed: 1,
      retryScheduled: 0,
    });
    expect(f.assembler.writeJsonV1.mock.calls).toHaveLength(0);
    expect(f.assembler.writeJsonV2.mock.calls).toHaveLength(0);
    expect(f.assembler.writeJsonV3.mock.calls).toContainEqual([
      'owner-1',
      f.sink,
      expect.any(Function),
    ]);
    expect(f.exports.complete.mock.calls).toContainEqual([
      {
        id: claim().id,
        claimId: claim().claimId,
        ownerUserId: 'owner-1',
        expectedProgressEpoch: 7,
        result: expectedV3Artifact,
      },
    ]);
  });

  it('fails closed on unsupported persisted versions before publishing a file', async () => {
    const f = fixture({ job: claim({ formatVersion: 99 }) });
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1,
      retryScheduled: 1,
      completed: 0,
    });
    expect(f.assembler.writeJsonV1.mock.calls).toHaveLength(0);
    expect(f.assembler.writeJsonV2.mock.calls).toHaveLength(0);
    expect(f.assembler.writeJsonV3.mock.calls).toHaveLength(0);
    expect(f.sink.abort.mock.calls.length).toBeGreaterThan(0);
    expect(f.exports.complete.mock.calls).toHaveLength(0);
  });

  const orphan = {
    jobId: claim().id,
    ownerUserId: 'owner-1',
    generation: claim().claimId!,
    claimId: '77777777-7777-4777-8777-777777777777',
    attempts: 1,
  };

  it('B79 recovers a transient Mongo queue outage without S3 DELETE or a false failure alert', async () => {
    const f = fixture();
    f.exports.complete.mockResolvedValueOnce(false);
    f.orphans.enqueue.mockRejectedValueOnce(
      new Error('private Mongo diagnostic'),
    );
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      stale: 1,
      completed: 0,
      orphanEnqueueRetries: 1,
      orphanEnqueueRecovered: 1,
      orphanEnqueueFailures: 0,
    });
    expect(f.orphans.enqueue.mock.calls).toHaveLength(2);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.orphans.clearPending.mock.calls).toHaveLength(0);
  });

  it('B79 preserves per-iteration recovery metrics with two proven orphans', async () => {
    const f = fixture();
    f.exports.complete.mockResolvedValue(false);
    f.orphans.enqueue.mockRejectedValueOnce(
      new Error('temporary Mongo outage'),
    );
    await expect(f.processor.runIteration(2)).resolves.toMatchObject({
      claimed: 2,
      stale: 2,
      completed: 0,
      orphanEnqueueRetries: 1,
      orphanEnqueueRecovered: 1,
      orphanEnqueueFailures: 0,
    });
    expect(f.orphans.enqueue.mock.calls).toHaveLength(3);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
  });

  it('B79 does not enqueue or report failures for a completed account export', async () => {
    const f = fixture();
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      completed: 1,
      orphanEnqueueRetries: 0,
      orphanEnqueueRecovered: 0,
      orphanEnqueueFailures: 0,
    });
    expect(f.orphans.enqueue.mock.calls).toHaveLength(0);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
  });

  it('B78 does not bypass a prior takeover verification deadline with direct S3 DELETE', async () => {
    const f = fixture();
    f.exports.complete.mockResolvedValueOnce(false);
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1,
      stale: 1,
      orphanDeleted: 0,
    });
    expect(f.orphans.enqueue.mock.calls).toContainEqual([
      expect.objectContaining({
        jobId: claim().id,
        generation: claim().claimId,
        ownerUserId: claim().userId,
      }),
    ]);
    // enqueue may be idempotently matching a task whose nextAttemptAt and
    // verificationUntil were already extended by a newer claim takeover.
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.orphans.clearPending.mock.calls).toHaveLength(0);
  });

  it('B78 does not turn a failed durable enqueue into permission for S3 DELETE', async () => {
    const f = fixture();
    f.exports.complete.mockResolvedValueOnce(false);
    f.orphans.enqueue.mockRejectedValue(new Error('Mongo queue unavailable'));
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      stale: 1,
      completed: 0,
      orphanEnqueueRetries: 2,
      orphanEnqueueRecovered: 0,
      orphanEnqueueFailures: 1,
    });
    expect(f.orphans.enqueue.mock.calls).toHaveLength(3);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.orphans.clearPending.mock.calls).toHaveLength(0);
  });

  it('B78 only deletes a queued generation in a later owner-fenced cleanup iteration', async () => {
    const f = fixture();
    f.exports.complete.mockResolvedValueOnce(false);
    await f.processor.runIteration();
    expect(f.orphans.enqueue.mock.calls).toHaveLength(1);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);

    f.exports.claimNext.mockResolvedValueOnce(null);
    f.orphans.claimNext.mockResolvedValueOnce(orphan);
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      orphanDeleted: 1,
      claimed: 0,
      orphanRetries: 0,
    });
    expect(f.store.findForOrphanCleanup.mock.calls).toContainEqual([
      orphan.jobId,
    ]);
    expect(f.orphans.renewLease.mock.calls.length).toBeGreaterThan(0);
    expect(f.artifacts.deleteArtifact.mock.calls).toContainEqual([
      orphan.jobId,
      orphan.generation,
    ]);
    expect(f.orphans.acknowledge.mock.calls).toContainEqual([
      expect.objectContaining({
        jobId: orphan.jobId,
        generation: orphan.generation,
        claimId: orphan.claimId,
      }),
    ]);
    expect(f.orphans.clearPending.mock.calls).toHaveLength(0);
  });

  it('B67 schedules durable orphan cleanup without inline S3 deletion', async () => {
    const f = fixture();
    f.exports.complete.mockResolvedValueOnce(false);
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      stale: 1,
      completed: 0,
    });
    expect(f.orphans.enqueue.mock.calls).toContainEqual([
      expect.objectContaining({
        jobId: claim().id,
        ownerUserId: 'owner-1',
        generation: claim().claimId,
      }),
    ]);
  });

  it('B67 never queues deletion for an uncertain Mongo completion', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    f.exports.complete.mockRejectedValueOnce(new Error('unknown commit'));
    f.exports.reschedule.mockResolvedValueOnce(false);
    await f.processor.runIteration();
    expect(f.orphans.enqueue.mock.calls).toHaveLength(0);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
  });

  it('B67 drains only a confirmed orphan generation and acknowledges it', async () => {
    const f = fixture({ job: null });
    f.orphans.claimNext.mockResolvedValueOnce(orphan);
    f.store.findForOrphanCleanup.mockResolvedValueOnce(
      claim({
        state: 'pending',
        active: true,
        claimId: null,
      }),
    );
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      orphanDeleted: 1,
      orphanRetries: 0,
    });
    expect(f.store.findForOrphanCleanup.mock.calls).toContainEqual([
      orphan.jobId,
    ]);
    expect(f.artifacts.deleteArtifact.mock.calls).toContainEqual([
      orphan.jobId,
      orphan.generation,
    ]);
    expect(f.orphans.acknowledge.mock.calls).toContainEqual([
      expect.objectContaining({
        jobId: orphan.jobId,
        generation: orphan.generation,
        claimId: orphan.claimId,
      }),
    ]);
  });

  it('B67 preserves a generation referenced by a completed job', async () => {
    const f = fixture({ job: null });
    f.orphans.claimNext.mockResolvedValueOnce(orphan);
    f.store.findForOrphanCleanup.mockResolvedValueOnce(
      claim({
        state: 'completed',
        active: false,
        artifactGeneration: orphan.generation,
      }),
    );
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      orphanPreserved: 1,
      orphanDeleted: 0,
    });
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.orphans.acknowledge.mock.calls).toHaveLength(1);
  });

  it('B82 revokes a matching expired claim before touching S3', async () => {
    const f = fixture({ job: null });
    const expiredAt = new Date(Date.now() - 1);
    f.orphans.claimNext.mockResolvedValueOnce(orphan);
    f.store.findForOrphanCleanup.mockResolvedValueOnce(
      claim({
        state: 'processing',
        active: true,
        claimId: orphan.generation,
        leaseExpiresAt: expiredAt,
        artifactGeneration: null,
      }),
    );
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      orphanDeleted: 1,
      orphanRetries: 0,
      orphanAuthorityBlocked: 0,
    });
    expect(f.store.fenceExpiredClaimForOrphanCleanup.mock.calls).toContainEqual(
      [
        {
          id: orphan.jobId,
          ownerUserId: orphan.ownerUserId,
          generation: orphan.generation,
          now: expectedDate,
        },
      ],
    );
    expect(
      f.store.fenceExpiredClaimForOrphanCleanup.mock.invocationCallOrder[0],
    ).toBeLessThan(f.orphans.renewLease.mock.invocationCallOrder[0]);
    expect(f.orphans.renewLease.mock.invocationCallOrder[0]).toBeLessThan(
      f.artifacts.deleteArtifact.mock.invocationCallOrder[0],
    );
  });

  it('B82 refuses S3 DELETE if a delayed completion wins the revocation CAS', async () => {
    const f = fixture({ job: null });
    f.orphans.claimNext.mockResolvedValueOnce(orphan);
    f.store.findForOrphanCleanup.mockResolvedValueOnce(
      claim({
        state: 'processing',
        claimId: orphan.generation,
        active: true,
        leaseExpiresAt: new Date(Date.now() - 1),
        artifactGeneration: null,
      }),
    );
    f.store.fenceExpiredClaimForOrphanCleanup.mockResolvedValueOnce(false);
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      orphanDeleted: 0,
      orphanRetries: 1,
      orphanAuthorityBlocked: 1,
    });
    expect(f.orphans.renewLease.mock.calls).toHaveLength(0);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.orphans.acknowledge.mock.calls).toHaveLength(0);
    expect(f.orphans.retry.mock.calls).toHaveLength(1);
  });

  it('B82 rejects a malformed current lease instead of assuming it expired', async () => {
    const f = fixture({ job: null });
    f.orphans.claimNext.mockResolvedValueOnce(orphan);
    f.store.findForOrphanCleanup.mockResolvedValueOnce(
      claim({
        state: 'processing',
        claimId: orphan.generation,
        active: true,
        leaseExpiresAt: null,
        artifactGeneration: null,
      }),
    );
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      orphanDeleted: 0,
      orphanRetries: 1,
    });
    expect(f.store.fenceExpiredClaimForOrphanCleanup.mock.calls).toHaveLength(
      0,
    );
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
  });

  it('B82 never revokes a different current generation before deleting an old orphan', async () => {
    const f = fixture({ job: null });
    f.orphans.claimNext.mockResolvedValueOnce(orphan);
    f.store.findForOrphanCleanup.mockResolvedValueOnce(
      claim({
        state: 'processing',
        claimId: '44444444-4444-4444-8444-444444444444',
        active: true,
        leaseExpiresAt: new Date(Date.now() + 30_000),
        artifactGeneration: null,
      }),
    );
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      orphanDeleted: 1,
      orphanRetries: 0,
    });
    expect(f.store.fenceExpiredClaimForOrphanCleanup.mock.calls).toHaveLength(
      0,
    );
    expect(f.artifacts.deleteArtifact.mock.calls).toContainEqual([
      orphan.jobId,
      orphan.generation,
    ]);
  });

  it('B67 waits for a still-live matching claim instead of deleting S3', async () => {
    const f = fixture({ job: null });
    f.orphans.claimNext.mockResolvedValueOnce(orphan);
    f.store.findForOrphanCleanup.mockResolvedValueOnce(
      claim({
        claimId: orphan.generation,
        leaseExpiresAt: new Date(Date.now() + 5 * 60_000),
      }),
    );
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      orphanRetries: 1,
      orphanDeleted: 0,
    });
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.orphans.retry.mock.calls).toContainEqual([
      expect.objectContaining({
        jobId: orphan.jobId,
        generation: orphan.generation,
      }),
    ]);
  });

  it('B67 rejects inconsistent owner authority before deleting any object', async () => {
    const f = fixture({ job: null });
    f.orphans.claimNext.mockResolvedValueOnce(orphan);
    f.store.findForOrphanCleanup.mockResolvedValueOnce(
      claim({
        userId: 'another-owner',
        state: 'failed',
      }),
    );
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      orphanRetries: 1,
      orphanDeleted: 0,
      orphanAuthorityBlocked: 1,
    });
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.orphans.retry.mock.calls).toHaveLength(1);
  });

  it('B67 does not mark a completed generation preserved if queue ACK lost', async () => {
    const f = fixture({ job: null });
    f.orphans.claimNext.mockResolvedValueOnce(orphan);
    f.orphans.acknowledge.mockResolvedValueOnce(false);
    f.store.findForOrphanCleanup.mockResolvedValueOnce(
      claim({
        state: 'completed',
        active: false,
        artifactGeneration: orphan.generation,
      }),
    );
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      orphanPreserved: 0,
      orphanRetries: 1,
    });
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
  });

  it('B67 retries deletion errors without losing durable cleanup claim', async () => {
    const f = fixture({ job: null });
    f.orphans.claimNext.mockResolvedValueOnce(orphan);
    f.store.findForOrphanCleanup.mockResolvedValueOnce(
      claim({
        state: 'pending',
        active: true,
        claimId: null,
      }),
    );
    f.artifacts.deleteArtifact.mockRejectedValueOnce(new Error('S3 offline'));
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      orphanRetries: 1,
      orphanDeleted: 0,
    });
    expect(f.orphans.retry.mock.calls).toHaveLength(1);
    expect(f.orphans.acknowledge.mock.calls).toHaveLength(0);
  });

  it('B67 leaves a claimed orphan recoverable after failed acknowledgement', async () => {
    const f = fixture({ job: null });
    f.orphans.claimNext.mockResolvedValueOnce(orphan);
    f.orphans.acknowledge.mockResolvedValueOnce(false);
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      orphanRetries: 1,
      orphanDeleted: 0,
    });
    expect(f.artifacts.deleteArtifact.mock.calls).toContainEqual([
      orphan.jobId,
      orphan.generation,
    ]);
  });

  it('B68 rechecks ownership after a slow authority lookup before touching S3', async () => {
    const f = fixture({ job: null });
    f.orphans.claimNext.mockResolvedValueOnce(orphan);
    f.store.findForOrphanCleanup.mockResolvedValueOnce(
      claim({
        state: 'pending',
        active: true,
        claimId: null,
      }),
    );
    f.orphans.renewLease.mockResolvedValueOnce(false);
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      orphanDeleted: 0,
      orphanRetries: 1,
    });
    expect(f.orphans.renewLease.mock.calls).toContainEqual([
      expect.objectContaining({
        jobId: orphan.jobId,
        generation: orphan.generation,
        claimId: orphan.claimId,
      }),
    ]);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.orphans.acknowledge.mock.calls).toHaveLength(0);
  });

  it('B68 renews the orphan claim BEFORE starting S3 and then acknowledges', async () => {
    const f = fixture({ job: null });
    f.orphans.claimNext.mockResolvedValueOnce(orphan);
    f.store.findForOrphanCleanup.mockResolvedValueOnce(
      claim({
        state: 'pending',
        active: true,
        claimId: null,
      }),
    );
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      orphanDeleted: 1,
      orphanRetries: 0,
    });
    expect(f.orphans.renewLease.mock.invocationCallOrder[0]).toBeLessThan(
      f.artifacts.deleteArtifact.mock.invocationCallOrder[0],
    );
    expect(f.artifacts.deleteArtifact.mock.invocationCallOrder[0]).toBeLessThan(
      f.orphans.acknowledge.mock.invocationCallOrder[0],
    );
  });

  it('B68 renews its cleanup lease while S3 deletion is still running', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-15T20:00:00.000Z'));
    const f = fixture({ job: null });
    f.orphans.claimNext.mockResolvedValueOnce(orphan);
    let finishDelete: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      finishDelete = resolve;
    });
    f.artifacts.deleteArtifact.mockImplementationOnce(() => blocked);
    const running = f.processor.runIteration();
    // Let the candidate be loaded, refreshed and S3 deletion start.
    await jest.advanceTimersByTimeAsync(1);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(
      Math.floor(ACCOUNT_EXPORT_LEASE_DURATION_MS / 3),
    );
    expect(f.orphans.renewLease.mock.calls.length).toBeGreaterThanOrEqual(2);
    finishDelete?.();
    await expect(running).resolves.toMatchObject({
      orphanDeleted: 1,
      orphanRetries: 0,
    });
    expect(f.orphans.acknowledge.mock.calls).toHaveLength(1);
  });

  it('B68 does not acknowledge a generation after heartbeat loses its claim', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-15T20:00:00.000Z'));
    const f = fixture({ job: null });
    f.orphans.claimNext.mockResolvedValueOnce(orphan);
    f.orphans.renewLease
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    let finishDelete: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      finishDelete = resolve;
    });
    f.artifacts.deleteArtifact.mockImplementationOnce(() => blocked);
    const running = f.processor.runIteration();
    await jest.advanceTimersByTimeAsync(1);
    await jest.advanceTimersByTimeAsync(
      Math.floor(ACCOUNT_EXPORT_LEASE_DURATION_MS / 3),
    );
    finishDelete?.();
    await expect(running).resolves.toMatchObject({
      orphanDeleted: 0,
      orphanRetries: 1,
    });
    expect(f.orphans.acknowledge.mock.calls).toHaveLength(0);
    expect(f.orphans.retry.mock.calls).toHaveLength(0);
  });

  it('B77 threads the claimed deadline through both S3 lease renewal and durable recheck retry', async () => {
    const f = fixture({ job: null });
    const until = new Date(Date.now() + 60 * 60_000);
    f.orphans.claimNext.mockResolvedValueOnce({
      ...orphan,
      verificationUntil: until,
    });
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      orphanDeleted: 0,
      orphanVerificationScheduled: 1,
    });
    expect(f.orphans.renewLease.mock.calls).toContainEqual([
      expect.objectContaining({
        jobId: orphan.jobId,
        generation: orphan.generation,
        claimId: orphan.claimId,
        verificationUntil: until,
      }),
    ]);
    expect(f.orphans.retry.mock.calls).toContainEqual([
      expect.objectContaining({
        jobId: orphan.jobId,
        generation: orphan.generation,
        claimId: orphan.claimId,
        verificationUntil: until,
        nextAttemptAt: expectedDate,
      }),
    ]);
  });

  it('B77 blocks S3 DELETE when a takeover invalidates cleanup lease renewal', async () => {
    const f = fixture({ job: null });
    const until = new Date(Date.now() + 60 * 60_000);
    f.orphans.claimNext.mockResolvedValueOnce({
      ...orphan,
      verificationUntil: until,
    });
    f.orphans.renewLease.mockResolvedValueOnce(false);
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      orphanDeleted: 0,
      orphanRetries: 1,
      orphanVerificationScheduled: 0,
    });
    expect(f.orphans.renewLease.mock.calls).toContainEqual([
      expect.objectContaining({ verificationUntil: until }),
    ]);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.orphans.acknowledge.mock.calls).toHaveLength(0);
  });

  it('B77 keeps the captured horizon on provider failure backoff', async () => {
    const f = fixture({ job: null });
    const until = new Date(Date.now() + 60 * 60_000);
    f.orphans.claimNext.mockResolvedValueOnce({
      ...orphan,
      verificationUntil: until,
    });
    f.artifacts.deleteArtifact.mockRejectedValueOnce(
      new Error('S3 unavailable'),
    );
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      orphanDeleted: 0,
      orphanRetries: 1,
    });
    expect(f.orphans.retry.mock.calls).toContainEqual([
      expect.objectContaining({ verificationUntil: until }),
    ]);
    expect(f.orphans.acknowledge.mock.calls).toHaveLength(0);
  });

  it('B75 retains an orphan after a successful S3 DELETE while the verification window remains open', async () => {
    const f = fixture({ job: null });
    const until = new Date(Date.now() + 60 * 60_000);
    f.orphans.claimNext.mockResolvedValueOnce({
      ...orphan,
      verificationUntil: until,
    });
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      orphanDeleted: 0,
      orphanVerificationScheduled: 1,
      orphanRetries: 0,
    });
    expect(f.artifacts.deleteArtifact.mock.calls).toContainEqual([
      orphan.jobId,
      orphan.generation,
    ]);
    expect(f.orphans.acknowledge.mock.calls).toHaveLength(0);
    expect(f.orphans.retry.mock.calls).toContainEqual([
      expect.objectContaining({
        jobId: orphan.jobId,
        generation: orphan.generation,
        claimId: orphan.claimId,
        nextAttemptAt: expectedDate,
      }),
    ]);
    const next = f.orphans.retry.mock.calls[0][0].nextAttemptAt;
    expect(next.getTime()).toBeLessThanOrEqual(until.getTime());
    expect(next.getTime()).toBeGreaterThan(Date.now());
  });

  it('B75 performs a final exact generation DELETE and ACK after verification deadline', async () => {
    const f = fixture({ job: null });
    f.orphans.claimNext.mockResolvedValueOnce({
      ...orphan,
      verificationUntil: new Date(Date.now() - 1),
    });
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      orphanDeleted: 1,
      orphanVerificationScheduled: 0,
      orphanRetries: 0,
    });
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(1);
    expect(f.orphans.retry.mock.calls).toHaveLength(0);
    expect(f.orphans.acknowledge.mock.calls).toContainEqual([
      expect.objectContaining({
        jobId: orphan.jobId,
        generation: orphan.generation,
        claimId: orphan.claimId,
      }),
    ]);
  });

  it('B75 never deletes when verification deadline is malformed', async () => {
    const f = fixture({ job: null });
    f.orphans.claimNext.mockResolvedValueOnce({
      ...orphan,
      verificationUntil: 'invalid' as unknown as Date,
    });
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      orphanDeleted: 0,
      orphanRetries: 1,
    });
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.orphans.acknowledge.mock.calls).toHaveLength(0);
    expect(f.orphans.retry.mock.calls).toHaveLength(1);
  });

  it('B75 does not ACK a verification task when lease-fenced retry loses', async () => {
    const f = fixture({ job: null });
    f.orphans.claimNext.mockResolvedValueOnce({
      ...orphan,
      verificationUntil: new Date(Date.now() + 60 * 60_000),
    });
    f.orphans.retry.mockResolvedValueOnce(false);
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      orphanDeleted: 0,
      orphanVerificationScheduled: 0,
      orphanRetries: 1,
    });
    expect(f.orphans.acknowledge.mock.calls).toHaveLength(0);
  });

  it('B75 protects a re-referenced generation before every S3 verification pass', async () => {
    const f = fixture({ job: null });
    f.orphans.claimNext.mockResolvedValueOnce({
      ...orphan,
      verificationUntil: new Date(Date.now() + 60 * 60_000),
    });
    f.store.findForOrphanCleanup.mockResolvedValueOnce(
      claim({
        state: 'completed',
        active: false,
        artifactGeneration: orphan.generation,
      }),
    );
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      orphanPreserved: 1,
      orphanDeleted: 0,
      orphanVerificationScheduled: 0,
    });
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.orphans.retry.mock.calls).toHaveLength(0);
  });

  it('B70 fails closed when the durable job is missing', async () => {
    const f = fixture({ job: null });
    f.orphans.claimNext.mockResolvedValueOnce(orphan);
    f.store.findForOrphanCleanup.mockResolvedValueOnce(null);
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 0,
      orphanDeleted: 0,
      orphanPreserved: 0,
      orphanRetries: 1,
      orphanAuthorityBlocked: 1,
    });
    expect(f.store.findForOrphanCleanup.mock.calls).toContainEqual([
      orphan.jobId,
    ]);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.orphans.acknowledge.mock.calls).toHaveLength(0);
    expect(f.orphans.retry.mock.calls).toContainEqual([
      expect.objectContaining({
        jobId: orphan.jobId,
        generation: orphan.generation,
        claimId: orphan.claimId,
        nextAttemptAt: expectedDate,
      }),
    ]);
  });

  it('B70 does not infer absence after an unavailable durable authority read', async () => {
    const f = fixture({ job: null });
    f.orphans.claimNext.mockResolvedValueOnce(orphan);
    f.store.findForOrphanCleanup.mockRejectedValueOnce(
      new Error('Mongo primary temporarily unavailable'),
    );
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      orphanRetries: 1,
      orphanDeleted: 0,
    });
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.orphans.acknowledge.mock.calls).toHaveLength(0);
    expect(f.orphans.retry.mock.calls).toHaveLength(1);
  });

  it.each(['pending', 'failed', 'processing'] as const)(
    'B70 preserves a generation referenced by an inconsistent %s job',
    async (state) => {
      const f = fixture({ job: null });
      f.orphans.claimNext.mockResolvedValueOnce(orphan);
      f.store.findForOrphanCleanup.mockResolvedValueOnce(
        claim({
          state,
          active: state !== 'failed',
          claimId: null,
          artifactGeneration: orphan.generation,
        }),
      );
      await expect(f.processor.runIteration()).resolves.toMatchObject({
        orphanDeleted: 0,
        orphanPreserved: 1,
        orphanRetries: 0,
      });
      expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
      expect(f.orphans.acknowledge.mock.calls).toContainEqual([
        expect.objectContaining({
          jobId: orphan.jobId,
          generation: orphan.generation,
          claimId: orphan.claimId,
        }),
      ]);
    },
  );

  it('B70 refuses a queue row pointing at a different durable job ID', async () => {
    const f = fixture({ job: null });
    f.orphans.claimNext.mockResolvedValueOnce(orphan);
    f.store.findForOrphanCleanup.mockResolvedValueOnce(
      claim({
        id: 'different-job',
        state: 'failed',
      }),
    );
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      orphanDeleted: 0,
      orphanRetries: 1,
      orphanAuthorityBlocked: 1,
    });
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.orphans.acknowledge.mock.calls).toHaveLength(0);
  });

  it('B71 queues S3 cleanup after multipart completion ACK is lost and Mongo retry CAS succeeds', async () => {
    const f = fixture();
    f.sink.commit.mockRejectedValueOnce(
      new Error('S3 completed but ACK was lost'),
    );
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1,
      retryScheduled: 1,
      completed: 0,
    });
    expect(f.sink.abort.mock.calls).toHaveLength(1);
    expect(f.exports.complete.mock.calls).toHaveLength(0);
    expect(f.exports.reschedule.mock.calls).toHaveLength(1);
    expect(f.orphans.enqueue.mock.calls).toContainEqual([
      expect.objectContaining({
        jobId: claim().id,
        generation: claim().claimId,
        ownerUserId: claim().userId,
      }),
    ]);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    const durableCas = f.exports.reschedule.mock.invocationCallOrder[0];
    const writeAhead = f.orphans.enqueue.mock.invocationCallOrder[0];
    expect(durableCas).toBeLessThan(writeAhead);
  });

  it('B71 preserves retry result when orphan enqueue fails after unknown S3 ACK', async () => {
    const f = fixture();
    f.sink.commit.mockRejectedValueOnce(
      new Error('S3 complete response unknown'),
    );
    f.orphans.enqueue.mockRejectedValue(
      new Error('Mongo orphan queue unavailable'),
    );
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      retryScheduled: 1,
      completed: 0,
      orphanEnqueueFailures: 1,
    });
    expect(f.orphans.enqueue.mock.calls).toHaveLength(3);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.orphans.clearPending.mock.calls).toHaveLength(0);
  });

  it('B71 does not delete uncertain multipart generation when Mongo retry CAS loses', async () => {
    const f = fixture();
    f.sink.commit.mockRejectedValueOnce(new Error('S3 complete ACK unknown'));
    f.exports.reschedule.mockResolvedValueOnce(false);
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1,
      stale: 1,
      completed: 0,
    });
    expect(f.sink.abort.mock.calls).toHaveLength(1);
    expect(f.orphans.enqueue.mock.calls).toHaveLength(0);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
  });

  it('B71 preserves S3 when Mongo retry CAS itself is unavailable', async () => {
    const f = fixture();
    f.sink.commit.mockRejectedValueOnce(new Error('S3 complete ACK unknown'));
    f.exports.reschedule.mockRejectedValueOnce(
      new Error('Mongo CAS unavailable'),
    );
    await expect(f.processor.runIteration()).rejects.toThrow(
      'Mongo CAS unavailable',
    );
    expect(f.orphans.enqueue.mock.calls).toHaveLength(0);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
  });

  it('B71 still queues cleanup after an abort error when a durable retry CAS wins', async () => {
    const f = fixture();
    f.sink.commit.mockRejectedValueOnce(new Error('Uncertain S3 commit'));
    f.sink.abort.mockRejectedValueOnce(new Error('S3 multipart abort failed'));
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      retryScheduled: 1,
      completed: 0,
    });
    expect(f.orphans.enqueue.mock.calls).toHaveLength(1);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
  });

  it('B71 retains normal successful assembly and completion without orphan cleanup', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      claimed: 1,
      completed: 1,
      retryScheduled: 0,
    });
    expect(f.orphans.enqueue.mock.calls).toHaveLength(0);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
  });

  it('B69 persists cleanup intent without inline S3 deletion', async () => {
    const f = fixture();
    f.exports.complete.mockResolvedValueOnce(false);
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      stale: 1,
      completed: 0,
    });
    expect(f.orphans.enqueue.mock.calls).toContainEqual([
      expect.objectContaining({
        jobId: claim().id,
        ownerUserId: claim().userId,
        generation: claim().claimId,
      }),
    ]);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.orphans.clearPending.mock.calls).toHaveLength(0);
  });

  it('B69 retains queued intent without performing a pending cancellation', async () => {
    const f = fixture();
    f.exports.complete.mockResolvedValueOnce(false);
    f.orphans.clearPending.mockRejectedValueOnce(
      new Error('Mongo cleanup ACK unavailable'),
    );
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      stale: 1,
    });
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.orphans.enqueue.mock.calls).toHaveLength(1);
    expect(f.orphans.clearPending.mock.calls).toHaveLength(0);
  });

  it('B69 never clears a task claimed by a second cleanup worker', async () => {
    const f = fixture();
    f.exports.complete.mockResolvedValueOnce(false);
    f.orphans.clearPending.mockResolvedValueOnce(false);
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      stale: 1,
      completed: 0,
    });
    expect(f.orphans.clearPending.mock.calls).toHaveLength(0);
    expect(f.orphans.acknowledge.mock.calls).toHaveLength(0);
    expect(f.orphans.retry.mock.calls).toHaveLength(0);
  });

  it('B78 never deletes S3 if Mongo cannot persist an orphan intent', async () => {
    const f = fixture();
    f.exports.complete.mockResolvedValueOnce(false);
    f.orphans.enqueue.mockRejectedValue(new Error('Mongo unavailable'));
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      stale: 1,
      completed: 0,
      orphanEnqueueFailures: 1,
    });
    expect(f.orphans.enqueue.mock.calls).toHaveLength(3);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
    expect(f.orphans.clearPending.mock.calls).toHaveLength(0);
  });

  it('B69 keeps uncertain Mongo completion out of write-ahead cleanup queue', async () => {
    const f = fixture({ job: claim({ formatVersion: 3 }) });
    f.exports.complete.mockRejectedValueOnce(
      new Error('Mongo commit reply lost'),
    );
    f.exports.reschedule.mockResolvedValueOnce(false);
    await expect(f.processor.runIteration()).resolves.toMatchObject({
      stale: 1,
      completed: 0,
    });
    expect(f.orphans.enqueue.mock.calls).toHaveLength(0);
    expect(f.orphans.clearPending.mock.calls).toHaveLength(0);
    expect(f.artifacts.deleteArtifact.mock.calls).toHaveLength(0);
  });

  it('B78 leaves pending intent for the owner-checked drainer', async () => {
    const f = fixture();
    f.exports.complete.mockResolvedValueOnce(false);
    await f.processor.runIteration();
    expect(f.orphans.enqueue.mock.calls).toContainEqual([
      expect.objectContaining({
        jobId: claim().id,
        generation: claim().claimId,
      }),
    ]);
    expect(f.orphans.clearPending.mock.calls).toHaveLength(0);
  });
});
