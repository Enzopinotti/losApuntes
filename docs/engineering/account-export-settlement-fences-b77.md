# B77 — Expired cleanup-lease settlement fences and stale-worker retries

**Project:** Los Apuntes 2026 — private account export S3 compensator.  
**Baseline:** `main@96793b0ef9cdb30ac019ef350c415b6e625ac7de` (B75-S3).  
**Release issue:** #353 OPEN. Production Study Progress flag OFF.

## Verified consistency gap

B75 introduced a durable one-hour `verificationUntil` horizon and a three-lease initial settling delay. Its ACK was guarded against a takeover extending the horizon, but two related operations were not:

1. The orphan queue's `claimNext` recovered expired **processing** leases by checking only `leaseExpiresAt <= now`, not `nextAttemptAt <= now`. If a takeover extended a preclaimed task's settling date, a crashed worker's lease could expire before that date and the next worker could delete S3 too early.
2. The worker's `renewLease` and `retry` operations checked only claim ID and unexpired lease, not the originally observed verification horizon. A pre-takeover worker could retry a task after another transaction extended its horizon, overwriting `nextAttemptAt` and shortening the newly established settling period.

## B77 implementation

- `MongoAccountExportOrphanCleanupStore.claimNext` selects processing rows **only when both** their lease and their scheduled `nextAttemptAt` are due. Pending work still requires its own due date.
- Expired account-export claim takeover extends `nextAttemptAt` with `$max` for the old generation regardless of whether the cleanup queue row is currently pending **or processing**. It does not change the existing queue claimant's `claimId`, state or lease. The extension remains in the **same Mongo transaction** as the job takeover and durable S3 generation ledger.
- `renewLease` and `retry` accept the optional `verificationUntil` date observed when a cleanup task was claimed. Their Mongo compare-and-set filters require an exact horizon match (legacy absent/null rows match null). A stale claimant can no longer renew or reschedule after a takeover extended its horizon.
- A `retry` applies `$max: { nextAttemptAt: input.nextAttemptAt }` rather than a `$set`, so an otherwise valid retry **never moves the task earlier** than an existing takeover grace period.
- The processor creates one immutable `fence` value from each claimed queue task and uses it consistently for initial and heartbeat renewal, recheck scheduling, provider-error backoff, ACK of preserved generations and final DELETE ACK. The worker returns a retry/lost-claim result rather than claiming successful cleanup when the fence CAS fails.

## Regression matrix

**Jest unit:** query requires due+expired processing lease; deadline checked for renew and retry; monotonic retry deadline; takeover extends processing queue row without stealing its claim; processor threads observed horizon into renewal, re-verification and S3-failure backoff, and does not DELETE when initial renewal rejects.

**Mongo replica-set opt-in:** a processing queue claim exists before a job takeover. The takeover extends the durable queue settling date and horizon; after its processing lease expires but **before** settling, the task cannot be claimed. Once due, another worker can claim it. A second case verifies that the pre-takeover worker's old-horizon renew/retry fail and do not reset the queue state, claim or future due date.

**Source contracts:** `scripts/test-account-export-b77-fences.mjs` joins historical B63–B75 guards under `pnpm test:account-lifecycle-contract`.

## Qualification limitations

Source-contract checks are not TypeScript/Jest/MongoDB/S3 execution. The acceptance runner remains `pnpm accept:account-export:b70 --expected-sha <MAIN_SHA>` on a **clean exact-head** checkout with Node 24, pnpm 9.15.9 and a local replica set; no manual CI is started by this change. Actual replica-set, concurrent workers, private S3 multipart ACK-loss, versioned object inventory, lifecycle policy, HTTP privacy and backup/restore remain required for issue #353.

The bounded one-hour B75 horizon is still a mitigation, not a mathematical guarantee if a provider's multipart completion materializes later. Do not enable the production flag or assert exactly-once distributed execution.

No changes to public APIs, payments, authentication or account export format inventories (v1 30, v2 31, v3 32 sections). Coordinate with PR #369 (orphan store spec), #349 (formatting) and #331 (legacy export tests); preserve B77 due/deadline/CAS invariants when rebasing.
