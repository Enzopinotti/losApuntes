/**
 * B84: a worker's now may be early, skewed or captured before the Mongo
 * command runs. Due work must be authorized by the Mongo primary's $$NOW
 * in the SAME atomic findOneAndUpdate that transfers claim ownership.
 *
 * Mongo aggregation $type protects against malformed/missing dates
 * comparing below BSON Date values. Do not replace these predicates with
 * client-only timestamps or an earlier Mongo read.
 */

export function accountExportJobClaimDueOnMongoServer() {
  return {
    $expr: {
      $or: [
        {
          $and: [
            { $eq: ['$state', 'pending'] },
            { $eq: [{ $type: '$nextAttemptAt' }, 'date'] },
            { $lte: ['$nextAttemptAt', '$$NOW'] },
          ],
        },
        {
          $and: [
            { $eq: ['$state', 'processing'] },
            { $eq: [{ $type: '$leaseExpiresAt' }, 'date'] },
            { $lte: ['$leaseExpiresAt', '$$NOW'] },
          ],
        },
      ],
    },
  } as const;
}

export function accountExportOrphanClaimDueOnMongoServer() {
  return {
    $expr: {
      $and: [
        { $eq: [{ $type: '$nextAttemptAt' }, 'date'] },
        { $lte: ['$nextAttemptAt', '$$NOW'] },
        {
          $or: [
            { $eq: ['$state', 'pending'] },
            {
              $and: [
                { $eq: ['$state', 'processing'] },
                { $eq: [{ $type: '$leaseExpiresAt' }, 'date'] },
                { $lte: ['$leaseExpiresAt', '$$NOW'] },
              ],
            },
          ],
        },
      ],
    },
  } as const;
}

export function accountExportOrphanOwnedAndDueOnMongoServer() {
  return {
    $expr: {
      $and: [
        { $eq: [{ $type: '$nextAttemptAt' }, 'date'] },
        { $lte: ['$nextAttemptAt', '$$NOW'] },
        { $eq: [{ $type: '$leaseExpiresAt' }, 'date'] },
        { $gt: ['$leaseExpiresAt', '$$NOW'] },
      ],
    },
  } as const;
}
