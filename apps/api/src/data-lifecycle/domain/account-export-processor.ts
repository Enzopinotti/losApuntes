import { Inject, Injectable } from '@nestjs/common';

import { AccountExportAssembler } from './account-export-assembler';
import { AccountExportEpochConflictError } from './account-export-epoch-conflict.error';
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
  type AccountExportAssemblyResult,
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
    let durableCompletionAttempted = false;
    let completedAssembly: AccountExportAssemblyResult | null = null;
    // The assembler checks its own epoch before S3 commit. This separate
    // owner snapshot also fences the S3-completed -> durable-complete gap.
    let progressEpoch: number | null = null;
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
      if (job.formatVersion !== 1 && job.formatVersion !== 2 && job.formatVersion !== 3) {
        throw new Error('Unsupported account export format version');
      }
      if (job.formatVersion === 3) {
        progressEpoch = await this.exports.captureStudyProgressExportEpoch(job.userId);
      }
      const assembly = job.formatVersion === 1
        ? await this.assembler.writeJsonV1(
            job.userId,
            sink,
            () => Promise.resolve(!leaseLost),
          )
        : job.formatVersion === 2
          ? await this.assembler.writeJsonV2(
              job.userId,
              sink,
              () => Promise.resolve(!leaseLost),
            )
          : await this.assembler.writeJsonV3(
              job.userId,
              sink,
              () => Promise.resolve(!leaseLost),
            );
      artifactCommitted = true;
      completedAssembly = assembly;
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

      // A progress mutation may land *during* S3 multipart completion.
      // Reject that attempt before the job can become downloadable.
      // On failure the catch path removes this claim-scoped generation.
      if (progressEpoch !== null) {
        await this.exports.assertStudyProgressExportEpoch(
          job.userId, progressEpoch,
        );
      }

      durableCompletionAttempted = true;
      const completed = await this.exports.complete({
        id: job.id,
        claimId,
        result: assembly,
        ...(progressEpoch !== null
          ? { ownerUserId: job.userId, expectedProgressEpoch: progressEpoch }
          : {}),
      });
      if (!completed) {
        // The durable CAS explicitly rejected this claim. It cannot publish
        // this attempt's generation; S3 cleanup is best-effort and must not
        // turn a known stale outcome into a retry of somebody else's claim.
        try {
          await this.artifacts.deleteArtifact(job.id, claimId);
        } catch {
          // Private-bucket object expiry is the deletion backstop.
        }
        return 'stale';
      }
      return 'completed';
    } catch (error) {
      clearInterval(heartbeat);
      await Promise.resolve(heartbeatInFlight);
      try {
        if (!artifactCommitted) {
          await sink.abort();
        } else if (!durableCompletionAttempted ||
          error instanceof AccountExportEpochConflictError) {
          // A known rejected epoch cannot have a durable completion. Delete
          // only this attempt's generation; never delete a shared object.
          await this.artifacts.deleteArtifact(job.id, claimId);
        }
        // An error after attempting the Mongo completion is ambiguous:
        // the transaction may have committed before the reply was lost.
        // Do NOT delete its possibly referenced S3 object. The lease/CAS
        // prevents false job completion; private bucket retention is the
        // backstop for any unreferenced generation.
      } catch {
        // Orphan cleanup has a bucket-lifecycle backstop. Do not mask the
        // original consistency/lease failure or manufacture a completed job.
      }
      if (leaseLost) return 'stale';

      const uncertainCompletion =
        artifactCommitted && durableCompletionAttempted &&
        !(error instanceof AccountExportEpochConflictError);
      // A Mongo commit can succeed even when the response is lost. Trust
      // only exact owner + job + generation + digest + version metadata.
      // Never delete S3 before deciding whether the durable job references it.
      if (uncertainCompletion && completedAssembly) {
        if (await this.isConfirmedCompletion(job, claimId, completedAssembly)) {
          return 'completed';
        }
      }

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
      if (!updated) {
        // The CAS was not ours: completion may have won between the first
        // reconciliation read and the attempt to reschedule. Re-read before
        // classifying the outcome. Otherwise preserve the S3 generation.
        if (uncertainCompletion && completedAssembly &&
          await this.isConfirmedCompletion(job, claimId, completedAssembly)) {
          return 'completed';
        }
        return 'stale';
      }

      if (uncertainCompletion) {
        // A successful reschedule is durable proof that this claim did NOT
        // complete. The generation is now safe to delete, and cannot be
        // referenced by a later retry (every claim gets a fresh UUID).
        try {
          await this.artifacts.deleteArtifact(job.id, claimId);
        } catch {
          // Failed cleanup is handled by the bucket's private lifecycle;
          // do not undo the already-durable retry/failure transition.
        }
      }
      return terminal ? 'failed' : 'retryScheduled';
    } finally {
      clearInterval(heartbeat);
    }
  }

  /**
   * Reconcile an unknown Mongo completion result with the durable record.
   * Only the precise attempt, owner, artifact digest, format and counters
   * prove the S3 object is actually referenced by a completed job.
   * Read failures remain unknown; never guess success or delete on ambiguity.
   */
  private async isConfirmedCompletion(
    job: AccountExportJobRecord,
    claimId: string,
    assembly: AccountExportAssemblyResult,
  ): Promise<boolean> {
    try {
      const current = await this.store.findOwned(job.id, job.userId);
      return Boolean(
        current &&
        current.userId === job.userId &&
        current.id === job.id &&
        current.state === 'completed' &&
        current.active === false &&
        current.artifactGeneration === claimId &&
        current.formatVersion === assembly.formatVersion &&
        current.artifactSectionCount === assembly.sectionCount &&
        current.artifactRecordCount === assembly.recordCount &&
        current.artifactByteLength === assembly.byteLength &&
        current.artifactSha256 === assembly.sha256 &&
        current.completedAt instanceof Date &&
        Number.isFinite(current.completedAt.getTime()),
      );
    } catch {
      // No durable evidence available: do not infer success. A subsequent
      // reschedule CAS may still prove non-completion; otherwise preserve S3.
      return false;
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
