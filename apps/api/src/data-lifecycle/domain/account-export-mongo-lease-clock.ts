/**
 * B83: the worker may capture its timestamp before a Mongo command waits
 * on the primary, a transaction, or a network retry. Expiration must ALSO
 * be evaluated by MongoDB at command execution time; otherwise a delayed
 * completion may publish an S3 generation after the authoritative lease
 * expired without any cleanup worker having run.
 *
 * These expressions belong in the SAME atomic job update filter that
 * checks state/claim/owner. $$NOW is MongoDB's evaluation timestamp, not
 * a client value supplied in a request or cached before the query.
 */
export function accountExportLeaseActiveOnMongoServer() {
  return {
    $expr: { $gt: ['$leaseExpiresAt', '$$NOW'] },
  } as const;
}

export function accountExportLeaseExpiredOnMongoServer() {
  return {
    $expr: { $lte: ['$leaseExpiresAt', '$$NOW'] },
  } as const;
}
