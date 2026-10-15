/**
 * A durable Mongo transaction rejected a v3 owner revision. No completed
 * export may reference this claim-scoped S3 generation, so it is safe to
 * delete after the worker catches this exact error.
 */
export class AccountExportEpochConflictError extends Error {
  readonly code = 'ACCOUNT_EXPORT_PROGRESS_EPOCH_CHANGED';
  constructor() {
    super('Study progress changed during account export');
    this.name = 'AccountExportEpochConflictError';
  }
}
