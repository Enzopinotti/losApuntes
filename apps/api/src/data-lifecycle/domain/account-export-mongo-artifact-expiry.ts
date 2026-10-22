/**
 * B85: private exported objects must not be retired merely because an
 * application worker believes their TTL has elapsed. Mongo primary time is
 * the reference for retirement AND candidate selection.
 *
 * Use this in the same transactional findOneAndUpdate that unlinks the
 * exact artifact and commits a durable S3 cleanup task. A prior read is
 * never sufficient to authorize a deletion. Missing or malformed expiry
 * dates must fail closed even under BSON cross-type comparisons.
 */
export function accountExportArtifactExpiredOnMongoServer() {
  return {
    $expr: {
      $and: [
        { $eq: [{ $type: '$artifactExpiresAt' }, 'date'] },
        { $lte: ['$artifactExpiresAt', '$$NOW'] },
      ],
    },
  } as const;
}
