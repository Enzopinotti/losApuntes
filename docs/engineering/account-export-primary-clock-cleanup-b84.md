# B84 — Mongo-primary due-time and lease ownership of account export cleanup

**Base:** `main@070a10a0f32d404dc5a6be04014ba58a7eaba6b3` (B83).  
**Production:** `STUDY_PROGRESS_ENABLED=false`; release #353 stays OPEN/HOLD; no manual CI.

## Problem / practical impact

B83 protected **export job** `complete`, `renewLease`, `reschedule` and B82 expired-generation revocation with Mongo `$$NOW`. Two other claim ownership paths still depended only on `input.now`, which is supplied by an application worker and can be artificially far ahead, stale, or captured before a delayed operation:

1. `MongoAccountExportStore.claimNext()` could prematurely claim a future **pending** job or steal an **unexpired processing** generation from its original worker. That transaction could create the old-generation orphan cleanup intent and invalidate an otherwise legitimate completion.
2. `MongoAccountExportOrphanCleanupStore.claimNext()` could claim a not-yet-due write-ahead cleanup generation or reclaim an actively leased cleanup task. `renewLease`, `acknowledge`, and `retry` used only client time and did not re-check the **due date** if an existing processing task was deferred by a concurrent takeover.

B74/B77 extended settlement and horizon dates; B80 wrote the cleanup ledger before the S3 upload; B81 removed direct object DELETE. These defenses should not be bypassed by an ahead-of-Mongo worker clock.

## B84 atomic Mongo authority

New pure module `account-export-mongo-claim-clock.ts` returns three `$expr` query predicates. They must appear on **the same atomic Mongo write**, not on a preliminary `find`:

1. **Export job selection**, `accountExportJobClaimDueOnMongoServer()`: pending jobs require a real BSON Date `nextAttemptAt <= $$NOW`; processing jobs require a real BSON Date `leaseExpiresAt <= $$NOW`. Same `findOneAndUpdate` inside the existing B80 transaction, followed by the write-ahead queue `$setOnInsert`. No claim can escape unless the server really considers the old claim due.
2. **Cleanup queue selection**, `accountExportOrphanClaimDueOnMongoServer()`: `nextAttemptAt <= $$NOW` for **both** pending and processing rows, with processing rows additionally requiring `leaseExpiresAt <= $$NOW`. This respects old-generation takeover settling delays even if a worker's client clock is ahead.
3. **Cleanup queue ownership**, `accountExportOrphanOwnedAndDueOnMongoServer()`: `nextAttemptAt <= $$NOW` AND `leaseExpiresAt > $$NOW` for each `renewLease`, `acknowledge` and `retry`. If another worker extends the settling due date while this cleanup task is still claimed, it cannot renew, acknowledge a deletion, or move the row back to pending ahead of schedule. After its lease expires and the due date actually passes, normal claim recovery resumes.

Every predicate requires `$type: 'date'` for relevant fields, avoiding permissive BSON cross-type comparisons of missing/null/corrupt dates. All legacy owner/generation/claimId `CAS` constraints, due fields for index selection, monotonic `$max` deadlines, B77 verificationUntil fence, B82/B83 generation CAS and B81 exact-object DELETE isolation remain. There are no new public API fields or S3 privileges.

## Regression evidence and testing

- Dependency-free executable `scripts/test-account-export-b84-mongo-claim-clock.test.mjs` uses the **same pure Mongo query objects as production**, interpreted by a tiny independent expression evaluator. Includes future pending jobs, still-live processing attempts, malformed dates, early write-ahead cleanup, old cleanup lease reclaim vs extended due, expired leased cleanup ACK, and client-clock skew. This **does not run MongoDB**.
- Jest store specs assert the query predicate is on each real claim/update/delete operation and preserve the original CAS. Earlier B80 claim fixture is revised to expect primary time.
- Opt-in local Mongo replica tests add **five scenarios**: ahead-clock pending job cannot start, live processing generation cannot be stolen, future orphan due cannot be claimed, processing orphan lease cannot be reclaimed early, and concurrent due extension defeats stale renewal/ACK/retry.
- Old replica tests for B67 crash reclaim/retry and B77 takeover verification intentionally used **client-time travel**; B84 changes those fixtures to explicitly move only the isolated Mongo test row to a past timestamp before claiming. They still prove recovery, but no longer rely on a clock-skew vulnerability.
- `scripts/test-account-export-b84-mongo-claim-guard.mjs` asserts the exact server guards and regression presence, invoked from root `test:account-lifecycle-contract` with the executable suite.

**Critical limits:** The pure Node suite and source guards are not evidence that a MongoDB server evaluated the expressions correctly under failover or real delay. Node24/pnpm9 complete Jest/typechecking, Mongo replica-set tests, S3 multipart/versioning, provider IAM, backups and retention/readback, browser acceptance, and audits #133/#141 remain required before release. Keep #353 HOLD and feature flag OFF.

## Parallel PR safety

Open formatting/lint/CI branches #349, #377, #383, #385, #386, #387, #388, #390 and #391 include potentially stale export/Mongo test source. Before merging them, rebase **the current main** and preserve the B84 helper and filters in both stores, the corrected historical tests, and the B78–B83 protections. No manual CI trigger.
