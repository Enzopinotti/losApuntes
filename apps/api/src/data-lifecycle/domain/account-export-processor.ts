import { Inject, Injectable } from '@nestjs/common';

import { AccountExportAssembler } from './account-export-assembler';
import { AccountExportService } from './account-export.service';
import {
  ACCOUNT_EXPORT_STORE,
  type AccountExportStore,
} from './account-export.store';
import {
  ACCOUNT_EXPORT_ARTIFACT_STORAGE,
  type AccountExportArtifactStorage,
} from '../storage/account-export-artifact-storage';
import {
  type AccountExportJobRecord,
  ACCOUNT_EXPORT_LEASE_DURATION_MS,
} from './account-export.types';

const MAX_ATTEMPTS = 5;
const FIRST_RETRY_DELAY_MS = 30_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;
const LEASE_RENEWAL_INTERVAL_MS = Math.floor(
  ACCOUNT_EXPORT_LEASE_DURATION_MS / 3,
);
const EXPIRED_ARTIFACT_BATCH_SIZE = 100;

export type AccountExportIteration = {
  claimed: number;
  completed: number;
  retryScheduled: number;
  failed: number;
  stale: number;
  expiredDeleted: number;
  expirationRetries: number;
};

function retryDelayMs(attempts: number): number {
  return Math.min(
    FIRST_RETRY_DELAY_MS * 2 ** Math.max(0, attempts - 1),
    MAX_RETRY_DELAY_MS,
  );
}

function isInactiveAccountError(error: unknown): boolean {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('getResponse' in error)
  ) {
    return false;
  }
  const response = (error as { getResponse: () => unknown }).getResponse();
  return (
    typeof response === 'object' &&
    response !== null &&
    'code' in response &&
    (response as { code?: unknown }).code === 'ACCOUNT_EXPORT_ACCOUNT_INACTIVE'
  );
}

@Injectable()
export class AccountExportProcessor {
  constructor(
    private readonly exports: AccountExportService,
    private readonly assembler: AccountExportAssembler,
    @Inject(ACCOUNT_EXPORT_STORE)
    private readonly store: AccountExportStore,
    @Inject(ACCOUNT_EXPORT_ARTIFACT_STORAGE)
    private readonly artifacts: AccountExportArtifactStorage,
  ) {}

  async runIteration(maxJobs = 1): Promise<AccountExportIteration> {
    if (!Number.isSafeInteger(maxJobs) || maxJobs < 1 || maxJobs > 20) {
      throw new Error(
        'Account export worker batch size must be between 1 and 20',
      );
    }

    const result: AccountExportIteration = {
      claimed: 0,
      completed: 0,
      retryScheduled: 0,
      failed: 0,
      stale: 0,
      expiredDeleted: 0,
      expirationRetries: 0,
    };

    await this.deleteExpiredArtifacts(result);
    for (let index = 0; index < maxJobs; index += 1) {
      const job = await this.exports.claimNext();
      if (!job) break;
      result.claimed += 1;
      const outcome = await this.processClaim(job);
      result[outcome] += 1;
    }
    return result;
  }

  private async processClaim(
    job: AccountExportJobRecord,
  ): Promise<'completed' | 'retryScheduled' | 'failed' | 'stale'> {
    if (!job || !job.claimId)
      throw new Error('Account export claim is invalid');
    const claimId = job.claimId;
    const sink = this.artifacts.createSink(job.id, claimId);
    let leaseLost = false;
    let artifactCommitted = false;
    let heartbeatInFlight: Promise<void> | null = null;
    const heartbeat = setInterval(() => {
      if (heartbeatInFlight || leaseLost) return;
      heartbeatInFlight = this.exports
        .renewLease({ id: job.id, claimId })
        .then((owned) => {
          if (!owned) leaseLost = true;
        })
        .catch(() => {
          leaseLost = true;
        })
        .finally(() => {
          heartbeatInFlight = null;
        });
    }, LEASE_RENEWAL_INTERVAL_MS);
    heartbeat.unref();

    try {
      // The version stored at request time is immutable for this claim.
      // Reject unknown values before staging an artifact.
      if (job.formatVersion !== 1 && job.formatVersion !== 2) {
        throw new Error('Unsupported account export format version');
      }
      const assembly = job.formatVersion === 1
        ? await this.assembler.writeJsonV1(
            job.userId,
            sink,
            () => Promise.resolve(!leaseLost),
          )
        : await this.assembler.writeJsonV2(
            job.userId,
            sink,
            () => Promise.resolve(!leaseLost),
          );
      artifactCommitted = true;
      clearInterval(heartbeat);
      await Promise.resolve(heartbeatInFlight);
      if (leaseLost) {
        // The multipart upload has already been committed. Aborting its
        // writer cannot reliably remove the completed object; explicitly
        // delete only this claim's attempt-scoped generation.
        try {
          await this.artifacts.deleteArtifact(job.id, claimId);
        } catch {
          // A private-bucket lifecycle rule is the deletion backstop.
          // No completed job can point at this lost-lease generation.
        }
        return 'stale';
      }

      const completed = await this.exports.complete({
        id: job.id,
        claimId,
        result: assembly,
      });
      if (!completed) {
        await this.artifacts.deleteArtifact(job.id, claimId);
        return 'stale';
      }
      return 'completed';
    } catch (error) {
      clearInterval(heartbeat);
      await Promise.resolve(heartbeatInFlight);
      try {
        if (!artifactCommitted) await sink.abort();
      } catch {
        // The next iteration and bucket lifecycle handle cleanup retries.
      }
      if (leaseLost) return 'stale';

      const inactiveAccount = isInactiveAccountError(error);
      const terminal = inactiveAccount || job.attempts >= MAX_ATTEMPTS;
      const state = terminal ? 'failed' : 'pending';
      const failureCode = inactiveAccount
        ? 'ACCOUNT_EXPORT_ACCOUNT_INACTIVE'
        : terminal
          ? 'EXPORT_RETRY_EXHAUSTED'
          : 'EXPORT_ASSEMBLY_RETRY';
      const updated = await this.exports.reschedule({
        id: job.id,
        claimId,
        state,
        nextAttemptAt: new Date(
          Date.now() + (terminal ? 0 : retryDelayMs(job.attempts)),
        ),
        failureCode,
      });
      if (!updated) return 'stale';
      return terminal ? 'failed' : 'retryScheduled';
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async deleteExpiredArtifacts(
    result: AccountExportIteration,
  ): Promise<void> {
    const now = new Date();
    const due = await this.store.findExpiredArtifacts({
      now,
      limit: EXPIRED_ARTIFACT_BATCH_SIZE,
    });

    for (const artifact of due) {
      try {
        await this.artifacts.deleteArtifact(artifact.id, artifact.generation);
        await this.store.clearExpiredArtifact({
          ...artifact,
          now,
        });
        result.expiredDeleted += 1;
      } catch {
        result.expirationRetries += 1;
      }
    }
  }
}
