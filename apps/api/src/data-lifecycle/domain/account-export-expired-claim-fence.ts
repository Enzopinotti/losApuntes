import { accountExportLeaseExpiredOnMongoServer } from './account-export-mongo-lease-clock';

/**
 * B82 CAS plan: the cleanup worker is not allowed to delete the current
 * generation merely because a lease looked expired in a prior Mongo read.
 * Revoke that generation on the SAME document written by complete() first.
 */
export function planAccountExportExpiredClaimFence(input: {
  id: string;
  ownerUserId: string;
  generation: string;
  now: Date;
}) {
  if (
    typeof input.id !== 'string' ||
    !input.id.trim() ||
    typeof input.ownerUserId !== 'string' ||
    !input.ownerUserId.trim() ||
    typeof input.generation !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(
      input.generation,
    ) ||
    !(input.now instanceof Date) ||
    !Number.isFinite(input.now.getTime())
  ) {
    throw new Error('Account export cleanup claim fence input is invalid');
  }
  return {
    filter: {
      id: input.id,
      userId: input.ownerUserId,
      active: true,
      state: 'processing' as const,
      claimId: input.generation,
      // Only truly expired Date leases; malformed/missing leases fail closed.
      leaseExpiresAt: { $lte: input.now },
      ...accountExportLeaseExpiredOnMongoServer(),
      artifactGeneration: null,
    },
    update: {
      $set: {
        state: 'pending' as const,
        claimId: null,
        leaseExpiresAt: null,
        nextAttemptAt: input.now,
        failureCode: 'EXPORT_ASSEMBLY_RETRY' as const,
        failedAt: null,
      },
    },
  };
}
