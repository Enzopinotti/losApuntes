/**
 * B80: record a reclaimable S3 attempt *before* the export worker starts any
 * multipart upload. The Mongo claim and this ledger insert commit together.
 *
 * A queue row is not permission to delete: the separate cleanup worker still
 * verifies the durable owner, current generation, active lease and horizon.
 * Even an immediate crash after the transaction can therefore be reconciled.
 */
export interface AccountExportClaimWriteAhead {
  jobId: string;
  ownerUserId: string;
  generation: string;
  state: 'pending';
  attempts: 0;
  nextAttemptAt: Date;
  claimId: null;
  leaseExpiresAt: null;
  verificationUntil: Date;
}

const MULTIPART_RECHECK_HORIZON_MS = 60 * 60_000;
const SETTLE_LEASE_MULTIPLIER = 3;

export function planAccountExportClaimWriteAhead(input: {
  jobId: string;
  ownerUserId: string;
  generation: string;
  now: Date;
  leaseExpiresAt: Date;
  leaseDurationMs: number;
}): AccountExportClaimWriteAhead {
  if (
    !input.jobId?.trim() ||
    !input.ownerUserId?.trim() ||
    !input.generation?.trim() ||
    !(input.now instanceof Date) ||
    !Number.isFinite(input.now.getTime()) ||
    !(input.leaseExpiresAt instanceof Date) ||
    !Number.isFinite(input.leaseExpiresAt.getTime()) ||
    input.leaseExpiresAt.getTime() <= input.now.getTime() ||
    !Number.isSafeInteger(input.leaseDurationMs) ||
    input.leaseDurationMs <= 0
  ) {
    throw new Error('Account export claim write-ahead input is invalid');
  }

  // The generation can only be written AFTER the claim and queue commit.
  // Do not run a cleanup attempt while its original lease may be valid or
  // a late multipart completion may still be settling.
  const nextAttemptAt = new Date(
    input.leaseExpiresAt.getTime() +
      input.leaseDurationMs * SETTLE_LEASE_MULTIPLIER,
  );
  const verificationUntil = new Date(
    nextAttemptAt.getTime() + MULTIPART_RECHECK_HORIZON_MS,
  );
  if (!Number.isFinite(verificationUntil.getTime())) {
    throw new Error('Account export claim write-ahead deadline is invalid');
  }
  return {
    jobId: input.jobId,
    ownerUserId: input.ownerUserId,
    generation: input.generation,
    state: 'pending',
    attempts: 0,
    nextAttemptAt,
    claimId: null,
    leaseExpiresAt: null,
    verificationUntil,
  };
}
