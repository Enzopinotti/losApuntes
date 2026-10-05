export const ACCOUNT_EXPORT_FORMAT = 'los-apuntes-account-export' as const;
export const ACCOUNT_EXPORT_FORMAT_VERSION = 1;
export const ACCOUNT_EXPORT_PAGE_LIMIT = 100;

export const ACCOUNT_EXPORT_JOB_STATES = [
  'pending',
  'processing',
  'failed',
] as const;

export type AccountExportJobState = (typeof ACCOUNT_EXPORT_JOB_STATES)[number];

export type AccountExportJsonScalar = string | number | boolean | null;
export type AccountExportJsonValue =
  | AccountExportJsonScalar
  | readonly AccountExportJsonValue[]
  | {
      readonly [key: string]: AccountExportJsonValue;
    };

export type AccountExportRecord = Readonly<
  Record<string, AccountExportJsonValue>
>;

export interface AccountExportJobRecord {
  id: string;
  userId: string;
  state: AccountExportJobState;
  active: boolean;
  formatVersion: number;
  attempts: number;
  nextAttemptAt: Date;
  claimId: string | null;
  leaseExpiresAt: Date | null;
  failureCode: string | null;
  failedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type AccountExportSectionPage = {
  records: readonly AccountExportRecord[];
  nextCursor: string | null;
};

export interface AccountExportContributor {
  readonly sectionId: string;
  readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage>;
}
