/**
 * B93: client/worker clocks are not an authorization source for the
 * retention deadline of private account-export objects. The same Mongo
 * primary that authorizes B85 cleanup must determine download eligibility.
 *
 * Keep this guard inside the owner-scoped, exact-generation Mongo read;
 * never infer authorization from an earlier job snapshot or Date.now().
 */
export function accountExportArtifactLiveOnMongoServer() {
  return {
    $expr: {
      $and: [
        { $eq: [{ $type: '$artifactExpiresAt' }, 'date'] },
        { $gt: ['$artifactExpiresAt', '$$NOW'] },
      ],
    },
  } as const;
}
