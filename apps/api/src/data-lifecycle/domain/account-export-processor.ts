import { Inject, Injectable } from '@nestjs/common';

import { AccountExportAssembler } from './account-export-assembler';
import { AccountExportEpochConflictError } from './account-export-epoch-conflict.error';
import { enqueueAccountExportOrphanWithRetry } from './account-export-orphan-enqueue';
import {
  ACCOUNT_EXPORT_ORPHAN_CLEANUP_STORE,
  type AccountExportOrphanCleanupStore,
} from './account-export-orphan-cleanup.store';
import { randomUUID } from 'node:crypto';
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
const ORPHAN_BATCH_SIZE = 10;
const ORPHAN_MAX_BACKOFF_MS = 6 * 60 * 60_000;

export type AccountExportIteration = {
  claimed: number;
  completed: number;
  retryScheduled: number;
  failed: number;
  stale: number;
  expiredDeleted: number;
  expiredRetired: number;
  expirationStale: number;
  expirationRetries: number;
  orphanDeleted: number;
  orphanVerificationScheduled: number;
  orphanPreserved: number;
  orphanRetries: number;
  orphanAuthorityBlocked: number;
  orphanEnqueueRetries: number;
  orphanEnqueueRecovered: number;
  orphanEnqueueFailures: number;
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
    @Inject(ACCOUNT_EXPORT_ORPHAN_CLEANUP_STORE)
    private readonly orphans: AccountExportOrphanCleanupStore,
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
      expiredRetired: 0,
      expirationStale: 0,
      expirationRetries: 0,
      orphanDeleted: 0,
      orphanVerificationScheduled: 0,
      orphanPreserved: 0,
      orphanRetries: 0,
      orphanAuthorityBlocked: 0,
      orphanEnqueueRetries: 0,
      orphanEnqueueRecovered: 0,
      orphanEnqueueFailures: 0,
    };

    await this.deleteExpiredArtifacts(result);
    try {
      await this.drainOrphanCleanup(result);
    } catch {
      // Orphan-queue storage faults are surfaced in the aggregate but must
      // not block unrelated fresh exports from being processed.
      result.orphanRetries += 1;
    }
    for (let index = 0; index < maxJobs; index += 1) {
      const job = await this.exports.claimNext();
      if (!job) break;
      result.claimed += 1;
      const outcome = await this.processClaim(job, result);
      result[outcome] += 1;
    }
    return result;
  }

  private async processClaim(
    job: AccountExportJobRecord,
    result: AccountExportIteration,
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
      if (
        job.formatVersion !== 1 &&
        job.formatVersion !== 2 &&
        job.formatVersion !== 3
      ) {
        throw new Error('Unsupported account export format version');
      }
      if (job.formatVersion === 3) {
        progressEpoch = await this.exports.captureStudyProgressExportEpoch(
          job.userId,
        );
      }
      const assembly =
        job.formatVersion === 1
          ? await this.assembler.writeJsonV1(job.userId, sink, () =>
              Promise.resolve(!leaseLost),
            )
          : job.formatVersion === 2
            ? await this.assembler.writeJsonV2(job.userId, sink, () =>
                Promise.resolve(!leaseLost),
              )
            : await this.assembler.writeJsonV3(job.userId, sink, () =>
                Promise.resolve(!leaseLost),
              );
      artifactCommitted = true;
      completedAssembly = assembly;
      clearInterval(heartbeat);
      await Promise.resolve(heartbeatInFlight);
      if (leaseLost) {
        // The multipart upload has already been committed. Aborting its
        // writer cannot reliably remove the completed object; explicitly
        // delete only this claim's attempt-scoped generation.
        await this.deleteOrEnqueueProvenOrphan(job, claimId, result);
        return 'stale';
      }

      // A progress mutation may land *during* S3 multipart completion.
      // Reject that attempt before the job can become downloadable.
      // On failure the catch path removes this claim-scoped generation.
      if (progressEpoch !== null) {
        await this.exports.assertStudyProgressExportEpoch(
          job.userId,
          progressEpoch,
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
        await this.deleteOrEnqueueProvenOrphan(job, claimId, result);
        return 'stale';
      }
      return 'completed';
    } catch (error) {
      clearInterval(heartbeat);
      await Promise.resolve(heartbeatInFlight);
      if (!artifactCommitted) {
        try {
          await sink.abort();
        } catch {
          // Multipart completion might have succeeded before the S3 ACK was
          // lost. Abort is best-effort and does NOT prove object absence.
        }
      }

      if (leaseLost) {
        if (!durableCompletionAttempted) {
          // This worker never requested Mongo completion. Its unique S3
          // generation cannot be a published artifact, even when multipart
          // completion itself returned an ambiguous error.
          await this.deleteOrEnqueueProvenOrphan(job, claimId, result);
        }
        // Once Mongo completion was attempted, preserve the S3 generation:
        // a lost lease/response is not proof the transaction was rejected.
        return 'stale';
      }

      const uncertainCompletion =
        artifactCommitted &&
        durableCompletionAttempted &&
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
        if (
          uncertainCompletion &&
          completedAssembly &&
          (await this.isConfirmedCompletion(job, claimId, completedAssembly))
        ) {
          return 'completed';
        }
        return 'stale';
      }

      // A successful reschedule CAS proves the old generation is no longer
      // publishable, EVEN WHEN the assembler never returned a successful
      // result. A lost acknowledgement from multipart complete may have
      // left an S3 object despite artifactCommitted remaining false.
      // Conversely, a lost/rejected Mongo CAS leaves S3 untouched because
      // another worker or a completed job may own the generation.
      await this.deleteOrEnqueueProvenOrphan(job, claimId, result);
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

  /**
   * Record only a proven orphan; B78 forbids the direct S3 fast path.
   * B79 retries transient Mongo queue writes, then surfaces an aggregate
   * failure counter rather than silently masking a lost cleanup intent.
   * A failed Mongo enqueue does not grant deletion authority.
   */
  private async deleteOrEnqueueProvenOrphan(
    job: AccountExportJobRecord,
    generation: string,
    result: AccountExportIteration,
  ): Promise<void> {
    await enqueueAccountExportOrphanWithRetry(async () => {
      await this.orphans.enqueue({
        jobId: job.id,
        ownerUserId: job.userId,
        generation,
        now: new Date(),
      });
    }, result);
    // Preserve S3 rather than bypassing settlement and owner fences.
    // Permanent enqueue failures require operator reconciliation/lifecycle.
  }

  /**
   * Restart-safe compensator with a bounded batch and claim lease.
   * Queue presence is not authorization to delete: verify durable ownership
   * before removing the exact UUID-qualified object generation.
   */
  private async drainOrphanCleanup(
    result: AccountExportIteration,
  ): Promise<void> {
    for (let index = 0; index < ORPHAN_BATCH_SIZE; index += 1) {
      const now = new Date();
      const candidate = await this.orphans.claimNext({
        now,
        claimId: randomUUID(),
        leaseExpiresAt: new Date(
          now.getTime() + ACCOUNT_EXPORT_LEASE_DURATION_MS,
        ),
      });
      if (!candidate) break;
      const ref = {
        jobId: candidate.jobId,
        generation: candidate.generation,
        claimId: candidate.claimId,
      };
      const fence = {
        ...ref,
        // A takeover can update this deadline while a different worker
        // holds the cleanup claim. Renew/retry/ACK must match the deadline
        // observed at claim time, not just the old claimId/lease.
        verificationUntil: candidate.verificationUntil ?? null,
      };
      try {
        // Unlike findOwned(id, owner), the internal authority lookup MUST
        // return a job even if its durable owner differs from the queue.
        // An owner-scoped miss could mistake a corrupt/misbound task for
        // an absent job and delete somebody else's completed S3 artifact.
        const job = await this.store.findForOrphanCleanup(candidate.jobId);
        if (!job) {
          result.orphanAuthorityBlocked += 1;
          // The queue is an intention, not an authority record. Missing
          // Mongo owner/job data is NOT evidence that an object is orphaned.
          // Retain the task and fail closed until the durable job is known.
          throw new Error('Export orphan cleanup authority is missing');
        }
        if (
          job.id !== candidate.jobId ||
          job.userId !== candidate.ownerUserId
        ) {
          result.orphanAuthorityBlocked += 1;
          throw new Error('Export orphan cleanup authority mismatch');
        }
        if (job.artifactGeneration === candidate.generation) {
          // Preserve any generation the durable row still references.
          // This includes an inconsistent/nonterminal record: deleting
          // based on state alone could destroy recoverable private data.
          const acknowledged = await this.orphans.acknowledge({
            ...fence,
            now: new Date(),
          });
          if (acknowledged) result.orphanPreserved += 1;
          else result.orphanRetries += 1;
          continue;
        }
        if (
          job.state === 'processing' &&
          job.claimId === candidate.generation
        ) {
          // B82: a delayed Mongo completion may have started while this
          // claim was still leased, then commit AFTER a cleanup read.
          // Checking expiration in memory is not enough. First revoke
          // the exact expired claim with a CAS against the SAME Mongo job
          // row that completion must update. If completion wins, this CAS
          // fails and S3 must remain untouched. If revocation wins, a late
          // completion cannot publish the deleted generation.
          const revokeAt = new Date();
          if (
            !(job.leaseExpiresAt instanceof Date) ||
            !Number.isFinite(job.leaseExpiresAt.getTime()) ||
            job.leaseExpiresAt.getTime() > revokeAt.getTime()
          ) {
            throw new Error(
              'Export attempt remains leased or lease is invalid',
            );
          }
          const revoked = await this.store.fenceExpiredClaimForOrphanCleanup({
            id: candidate.jobId,
            ownerUserId: candidate.ownerUserId,
            generation: candidate.generation,
            now: revokeAt,
          });
          if (!revoked) {
            result.orphanAuthorityBlocked += 1;
            throw new Error('Account export cleanup claim revocation lost CAS');
          }
        }

        if (
          candidate.verificationUntil != null &&
          (!(candidate.verificationUntil instanceof Date) ||
            !Number.isFinite(candidate.verificationUntil.getTime()))
        ) {
          // Corrupt verification metadata is not permission to delete
          // private objects. Retain the task under normal retry/backoff.
          throw new Error(
            'Account export cleanup verification deadline is invalid',
          );
        }

        // A slow Mongo read can outlive the initial lease. Prove ownership
        // once more immediately before S3, then renew during the deletion.
        const refreshedAt = new Date();
        const owned = await this.orphans.renewLease({
          ...fence,
          now: refreshedAt,
          leaseExpiresAt: new Date(
            refreshedAt.getTime() + ACCOUNT_EXPORT_LEASE_DURATION_MS,
          ),
        });
        if (!owned) {
          result.orphanRetries += 1;
          continue;
        }

        let leaseLost = false;
        let renewalInFlight: Promise<void> | null = null;
        const renewal = setInterval(() => {
          if (leaseLost || renewalInFlight) return;
          const renewalAt = new Date();
          renewalInFlight = this.orphans
            .renewLease({
              ...fence,
              now: renewalAt,
              leaseExpiresAt: new Date(
                renewalAt.getTime() + ACCOUNT_EXPORT_LEASE_DURATION_MS,
              ),
            })
            .then((current) => {
              if (!current) leaseLost = true;
            })
            .catch(() => {
              leaseLost = true;
            })
            .finally(() => {
              renewalInFlight = null;
            });
        }, LEASE_RENEWAL_INTERVAL_MS);
        renewal.unref();
        try {
          await this.artifacts.deleteArtifact(
            candidate.jobId,
            candidate.generation,
          );
        } finally {
          clearInterval(renewal);
          await Promise.resolve(renewalInFlight);
        }

        if (leaseLost) {
          // A second worker may have reclaimed the queue task. S3 delete
          // is attempt-scoped/idempotent, but only the current claimant may
          // acknowledge durable cleanup.
          result.orphanRetries += 1;
          continue;
        }
        // A reclaimed multipart upload can finish AFTER an earlier
        // DELETE returns success. Keep its durable task, and re-run owner,
        // generation, and lease checks on each verification pass. A crash
        // between passes leaves the next attempt in Mongo, not memory.
        if (candidate.verificationUntil != null) {
          const verifiedAt = new Date();
          if (verifiedAt.getTime() < candidate.verificationUntil.getTime()) {
            const nextAttemptAt = new Date(
              Math.min(
                verifiedAt.getTime() + 10 * 60_000,
                candidate.verificationUntil.getTime(),
              ),
            );
            const deferred = await this.orphans.retry({
              ...fence,
              now: verifiedAt,
              nextAttemptAt,
            });
            if (deferred) result.orphanVerificationScheduled += 1;
            else result.orphanRetries += 1;
            continue;
          }
        }

        const acked = await this.orphans.acknowledge({
          ...fence,
          now: new Date(),
        });
        if (acked) result.orphanDeleted += 1;
        else result.orphanRetries += 1;
      } catch {
        result.orphanRetries += 1;
        // Bounded exponential retry; never exhaust permanently. A crashed
        // worker's processing lease can be claimed by a new worker.
        const backoff = Math.min(
          30_000 * 2 ** Math.min(candidate.attempts - 1, 10),
          ORPHAN_MAX_BACKOFF_MS,
        );
        try {
          await this.orphans.retry({
            ...fence,
            now: new Date(),
            nextAttemptAt: new Date(Date.now() + backoff),
          });
        } catch {
          // An expired claim can be re-claimed; do not stall other work.
        }
      }
    }
  }

  private async deleteExpiredArtifacts(
    result: AccountExportIteration,
  ): Promise<void> {
    const now = new Date();
    let due: Awaited<ReturnType<AccountExportStore['findExpiredArtifacts']>>;
    try {
      due = await this.store.findExpiredArtifacts({
        now,
        limit: EXPIRED_ARTIFACT_BATCH_SIZE,
      });
    } catch {
      // An expiry-sweep outage is not permission to stall fresh exports.
      result.expirationRetries += 1;
      return;
    }

    for (const artifact of due) {
      try {
        // No S3 request here. A single Mongo transaction must atomically
        // remove the public download reference and enqueue an exact
        // owner-scoped generation for crash-safe cleanup. The orphan drain
        // below performs the actual S3 DELETE after owner/lease checks.
        const retired = await this.store.retireExpiredArtifact({
          ...artifact,
          now,
        });
        if (retired) result.expiredRetired += 1;
        else result.expirationStale += 1;
      } catch {
        // A transaction may have committed before its ACK was lost. Never
        // issue an opportunistic DELETE; its durable queue will be drained
        // after a subsequent read, or the transaction will be retried.
        result.expirationRetries += 1;
      }
    }
  }
}
