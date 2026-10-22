/** Server-only queue for proven orphaned account-export S3 generations. */
export const ACCOUNT_EXPORT_ORPHAN_CLEANUP_STORE = Symbol(
  'ACCOUNT_EXPORT_ORPHAN_CLEANUP_STORE',
);

export interface AccountExportOrphanCleanupRecord {
  jobId: string;
  ownerUserId: string;
  generation: string;
  attempts: number;
  claimId: string;
  /**
   * Only reclaimed, previously processing attempts get a bounded
   * post-delete recheck period; ordinary proven orphans ACK immediately.
   */
  verificationUntil?: Date | null;
}

export interface AccountExportOrphanCleanupStore {
  enqueue(input: {
    jobId: string;
    ownerUserId: string;
    generation: string;
    now: Date;
  }): Promise<void>;
  /**
   * Remove a queued intent only while it is still pending/unclaimed.
   * Once a second worker has claimed it, that worker owns the final ACK.
   */
  clearPending(input: { jobId: string; generation: string }): Promise<boolean>;
  claimNext(input: {
    now: Date;
    claimId: string;
    leaseExpiresAt: Date;
  }): Promise<AccountExportOrphanCleanupRecord | null>;
  renewLease(input: {
    jobId: string;
    generation: string;
    claimId: string;
    now: Date;
    leaseExpiresAt: Date;
    /** Fence ownership against takeover extending the recheck horizon. */
    verificationUntil?: Date | null;
  }): Promise<boolean>;
  acknowledge(input: {
    jobId: string;
    generation: string;
    claimId: string;
    now: Date;
    /** Prevent ACK when takeover installed a newer recheck deadline. */
    verificationUntil?: Date | null;
  }): Promise<boolean>;
  retry(input: {
    jobId: string;
    generation: string;
    claimId: string;
    nextAttemptAt: Date;
    now: Date;
    /** A stale claimant must not shorten the takeover settling period. */
    verificationUntil?: Date | null;
  }): Promise<boolean>;
}
