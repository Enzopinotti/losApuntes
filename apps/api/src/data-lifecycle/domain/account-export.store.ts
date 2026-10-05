import type { AccountExportJobRecord } from './account-export.types';

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

  reschedule(input: {
    id: string;
    claimId: string;
    state: 'pending' | 'failed';
    nextAttemptAt: Date;
    failureCode: string;
    failedAt: Date | null;
  }): Promise<boolean>;

  hasFailed(): Promise<boolean>;
}
