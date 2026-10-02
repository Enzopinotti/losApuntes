import type {
  AccountClosureManagerBlocker,
  AccountClosureStoreResult,
  AccountOffboardingJobRecord,
} from './account-lifecycle.types';

export const ACCOUNT_LIFECYCLE_STORE = Symbol('ACCOUNT_LIFECYCLE_STORE');

export interface AccountLifecycleStore {
  listManagementBlockers(
    userId: string,
    limit: number,
  ): Promise<{ items: AccountClosureManagerBlocker[]; truncated: boolean }>;

  closeAccount(input: {
    userId: string;
    expectedCredentialVersion: number;
    now: Date;
    auditId: string;
    cleanupJobId: string;
  }): Promise<AccountClosureStoreResult>;

  claimNextCleanup(input: {
    now: Date;
    claimId: string;
    leaseExpiresAt: Date;
  }): Promise<AccountOffboardingJobRecord | null>;

  completeCleanup(input: {
    userId: string;
    claimId: string;
    completedAt: Date;
  }): Promise<boolean>;

  rescheduleCleanup(input: {
    userId: string;
    claimId: string;
    state: 'pending' | 'failed';
    nextAttemptAt: Date;
    failureCode: string;
  }): Promise<boolean>;
}
