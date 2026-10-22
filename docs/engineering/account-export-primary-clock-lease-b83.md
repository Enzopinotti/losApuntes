# B83 — Mongo primary time is authoritative for account-export leases

**Base:** B82 `main@d9bc2ae79a27f71d58f3d18c4b8786befd064c4f`. Release issue #353 remains OPEN/HOLD; `STUDY_PROGRESS_ENABLED` OFF.

## Vulnerability

Prior to B83, the Mongo `complete()` CAS checked `leaseExpiresAt > input.completedAt`, with `completedAt` captured by the API worker **before** the Mongo command (or a v3 transaction) executed. An RPC delay, Mongo primary stall or server queue can let that old timestamp authorize a late commit **after the lease actually expires**. B82 fenced cleanup versus current-claim completion but did not independently prevent these stale finalizations when no cleanup worker had yet run.

The same client-clock weakness affected `renewLease`, `reschedule` and B82's expired-claim revocation. A delayed renewal could resurrect an expired lease; an ahead-of-primary worker clock could revoke a lease that was still valid.

## New atomic contract

The executable, dependency-free `account-export-mongo-lease-clock.ts` exports two Mongo query predicates:

- Active claim: `$expr: { $gt: ['$leaseExpiresAt', '$$NOW'] }`.
- Expired claim: `$expr: { $lte: ['$leaseExpiresAt', '$$NOW'] }`.

These are **additional checks on the exact same Mongo job update**, not a separate read or an in-process clock comparison.

1. `MongoAccountExportStore.renewLease` requires both `leaseExpiresAt > input.now` and **Mongo primary** `leaseExpiresAt > $$NOW`. A delayed heartbeat never resurrects an expired claim.
2. `reschedule` applies the same server-time fence to terminal failure and pending retry CAS, preventing expired workers from changing live job state.
3. `complete` retains the existing `leaseExpiresAt > input.completedAt`, exact active/state/claim/version CAS, and **adds `$$NOW` at Mongo execution**. This filter is shared by v1/v2 direct update and by the v3 owner-epoch transaction's job update. In v3, a losing job write rolls back the earlier User epoch update.
4. B82 `fenceExpiredClaimForOrphanCleanup` retains exact job ID, owner, generation, processing state, `artifactGeneration:null` and `leaseExpiresAt <= worker now`, but additionally requires **`leaseExpiresAt <= $$NOW`**. A worker with a clock ahead of the primary cannot preempt a valid claim to delete its S3 object.
5. B74/B77 takeover, B78 owner-checked cleanup, B80 new-generation write-ahead and B81 multipart-only abort remain intact. No bucket permissions, public status fields or feature flags are widened.

No wall-clock timestamp captured in an earlier application call can bypass the primary lease predicate. This does not guarantee that all nodes have perfectly synchronized clocks; a production Mongo primary should use reliable NTP and be validated under real failover and clock-skew exercises.

## Regression evidence

- Executable Node checks: `node --experimental-strip-types --test scripts/test-account-export-b83-mongo-clock.test.mjs`, using the same predicate module as production. Tests verify exact Mongo expressions and the two skew/late-ack scenarios. **These are semantic checks, not an actual MongoDB execution.**
- `scripts/test-account-export-b83-mongo-clock-guard.mjs` structurally asserts all three active write paths, B82 expired revocation, v3 transaction reuse, and the coverage and release HOLD; wired into `test:account-lifecycle-contract`.
- Mongo store Jest adds precise filter assertions for renew/reschedule/complete and v3.
- Mongo replica-set opt-in acceptance now includes v1/v2 delayed completion after lease expiry with old `completedAt`, v3 rollback with unchanged owner epoch, stale renew/reschedule, and clock-ahead B82 revocation. B82 **completion-wins** and **renewal-wins** fixtures were corrected to keep a genuinely valid server-time lease; stale client timestamps may no longer authorize those successes.

**Not run:** Node24/pnpm9 full API Jest/typecheck, Mongo replica-set integration, real S3 provider/HTTP/browser, provider failover and IAM/lifecycle/backup/readback, audits #133/#141. A green Node predicate unit suite or source guard is not a production qualification.

## Parallel PRs

#349, #377, #383, #386, #387 and #388 may contain old formatter/lint snapshots of export or Mongo tests. Rebase on the **current merged main**; preserve `accountExportLeaseActiveOnMongoServer`, `accountExportLeaseExpiredOnMongoServer`, the four atomic updates and opt-in tests. Never replace current source with stale snapshots or bypass the B82 generation CAS. Keep #353 OPEN/HOLD and do not manually run CI.
