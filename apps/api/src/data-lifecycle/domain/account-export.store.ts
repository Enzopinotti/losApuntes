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

  clearExpiredArtifact(input: {
    id: string;
    generation: string;
    expiresAt: Date;
    now: Date;
  }): Promise<boolean>;

  hasFailed(): Promise<boolean>;
}
