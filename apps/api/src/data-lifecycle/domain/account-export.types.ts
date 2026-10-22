export const ACCOUNT_EXPORT_FORMAT = 'los-apuntes-account-export' as const;
/**
 * Default to v1 only when no private data requires a newer format.
 * A persisted export job always retains its original version.
 */
export const ACCOUNT_EXPORT_FORMAT_VERSION = 1;
export type AccountExportFormatVersion = 1 | 2 | 3;
export const ACCOUNT_EXPORT_PAGE_LIMIT = 100;
export const ACCOUNT_EXPORT_LEASE_DURATION_MS = 2 * 60 * 1000;
export const ACCOUNT_EXPORT_ARTIFACT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const ACCOUNT_EXPORT_JOB_STATES = [
  'pending',
  'processing',
  'failed',
  'completed',
] as const;

export const ACCOUNT_EXPORT_FAILURE_CODES = [
  'ACCOUNT_EXPORT_ACCOUNT_INACTIVE',
  'EXPORT_ASSEMBLY_RETRY',
  'EXPORT_RETRY_EXHAUSTED',
] as const;

export type AccountExportJobState = (typeof ACCOUNT_EXPORT_JOB_STATES)[number];
export type AccountExportFailureCode =
  (typeof ACCOUNT_EXPORT_FAILURE_CODES)[number];

export function isAccountExportFailureCode(
  value: unknown,
): value is AccountExportFailureCode {
  return (
    typeof value === 'string' &&
    (ACCOUNT_EXPORT_FAILURE_CODES as readonly string[]).includes(value)
  );
}

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
  failureCode: AccountExportFailureCode | null;
  failedAt: Date | null;
  completedAt?: Date | null;
  artifactSectionCount?: number | null;
  artifactRecordCount?: number | null;
  artifactByteLength?: number | null;
  artifactSha256?: string | null;
  artifactGeneration?: string | null;
  artifactExpiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountExportAssemblyResult {
  format: typeof ACCOUNT_EXPORT_FORMAT;
  formatVersion: AccountExportFormatVersion;
  sectionCount: number;
  recordCount: number;
  byteLength: number;
  sha256: string;
}

export interface ExpiredAccountExportArtifact {
  id: string;
  generation: string;
  expiresAt: Date;
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
