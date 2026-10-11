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
    completedAt: Date;
    result: AccountExportAssemblyResult;
  }): Promise<boolean>;

  hasFailed(): Promise<boolean>;
}
