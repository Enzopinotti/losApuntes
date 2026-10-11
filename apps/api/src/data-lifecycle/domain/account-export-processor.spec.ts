import { ForbiddenException } from '@nestjs/common';

import type { AccountExportArtifactSink } from './account-export-assembler';
import type { AccountExportAssembler } from './account-export-assembler';
import type { AccountExportService } from './account-export.service';
import type { AccountExportStore } from './account-export.store';
import type {
  AccountExportAssemblyResult,
  AccountExportJobRecord,
} from './account-export.types';
import type { AccountExportArtifactStorage } from '../storage/account-export-artifact-storage';
import { AccountExportProcessor } from './account-export-processor';

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
    complete: jest.fn().mockResolvedValue(true),
    reschedule: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<AccountExportService>;
  const assembler = {
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
    findExpiredArtifacts: jest.fn().mockResolvedValue([]),
    clearExpiredArtifact: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<AccountExportStore>;
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
    processor: new AccountExportProcessor(exports, assembler, store, artifacts),
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
});
