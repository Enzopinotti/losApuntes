import type {
  AccountExportAssemblyResult,
  AccountExportFailureCode,
  AccountExportJobRecord,
} from './account-export.types';

export const ACCOUNT_EXPORT_STORE = Symbol('ACCOUNT_EXPORT_STORE');

export interface AccountExportStore {
  requestActive(input: {
    id: string;
    userId: string;
    formatVersion: number;
    now: Date;
  }): Promise<{ job: AccountExportJobRecord; created: boolean }>;

  findOwned(id: string, userId: string): Promise<AccountExportJobRecord | null>;

  /**
   * B93: second owner- and generation-scoped read on the Mongo PRIMARY.
   * True only if the exact published artifact is still referenced and
   * its stored expiry is strictly after Mongo's $NOW. No client now.
   */
  isOwnedArtifactCurrent(input: {
    id: string;
    userId: string;
    generation: string;
    expiresAt: Date;
  }): Promise<boolean>;

  /** Internal cleanup authority probe: read the durable owner by job ID. */
  findForOrphanCleanup(id: string): Promise<AccountExportJobRecord | null>;

  /**
   * B82: atomically revoke an expired current processing generation before
   * S3 cleanup. A Mongo completion raced with cleanup either wins first
   * (revoke returns false; preserve) or loses to this CAS (completion cannot
   * subsequently publish the doomed generation).
   *
   * This may only reschedule the EXACT expired active claim, for the exact
   * durable owner. Never revoke a newer claim or a completed reference.
   */
  fenceExpiredClaimForOrphanCleanup(input: {
    id: string;
    ownerUserId: string;
    generation: string;
    now: Date;
  }): Promise<boolean>;

  claimNext(input: {
    now: Date;
    claimId: string;
    leaseExpiresAt: Date;
  }): Promise<AccountExportJobRecord | null>;

  renewLease(input: {
    id: string;
    claimId: string;
    now: Date;
    leaseExpiresAt: Date;
  }): Promise<boolean>;

  reschedule(input: {
    id: string;
    claimId: string;
    state: 'pending' | 'failed';
    nextAttemptAt: Date;
    failureCode: AccountExportFailureCode;
    now: Date;
  }): Promise<boolean>;

  complete(input: {
    id: string;
    claimId: string;
    artifactGeneration: string;
    completedAt: Date;
    artifactExpiresAt: Date;
    result: AccountExportAssemblyResult;
    /** Required only by v3: atomically fence owner writes with completion. */
    ownerUserId?: string;
    expectedProgressEpoch?: number;
  }): Promise<boolean>;

  findExpiredArtifacts(input: {
    now: Date;
    limit: number;
  }): Promise<import('./account-export.types').ExpiredAccountExportArtifact[]>;

  /**
   * Atomically unlink a due completed artifact AND persist its exact S3
   * generation in the private cleanup queue. Never DELETE S3 first.
   *
   * The same Mongo transaction must commit both operations or neither.
   * False means the generation/expiry no longer match the durable record.
   */
  retireExpiredArtifact(input: {
    id: string;
    generation: string;
    expiresAt: Date;
    now: Date;
  }): Promise<boolean>;

  hasFailed(): Promise<boolean>;
}
