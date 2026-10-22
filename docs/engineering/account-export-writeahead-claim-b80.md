# B80 — Transactional write-ahead cleanup for EVERY account-export claim

**Scope:** recovery of private S3 objects after worker crashes, failed/ambiguous multipart completion, and sustained Mongo enqueue outages.  
**Base:** `main@f342a530ac6233f48e660c42a7d4c3af83b9b3ea` (B79).  
**Release:** #353 OPEN/HOLD; `STUDY_PROGRESS_ENABLED` OFF in production. Keep #133/#141 and QA gates explicit.

## Why B79 is insufficient

B79 retries `orphans.enqueue` three times and emits a count-only warning on exhaustion, but the queue write still happened AFTER the S3 writer attempted an upload. A process killed between a successful object commit and durable enqueue, or a prolonged Mongo outage after S3 commit, could still leave a completed private object with no cleanup intent. Mongo's current export job retains only the **most recent** claim, so after retry/takeover old generations may no longer be recoverable from the job document.

A general S3 listing scanner would require new `s3:ListBucket` permission and still need carefully proven owner/claim authority; this block intentionally does NOT grant listing, expose object keys or infer that “unreferenced” means immediately deletable.

## New invariant

`MongoAccountExportStore.claimNext` already wraps the Mongo job claim and B74 takeover cleanup in a session transaction. **B80 adds an insert-only recovery intent for the newly claimed generation in that same transaction**, regardless of whether the prior job was `pending` or an expired `processing` attempt.

1. Acquire the next claim with `findOneAndUpdate(new:false, session)`; verify the durable prior owner/job ID.
2. If it is an expired takeover, preserve B74/B77's **old** generation write-ahead + horizon extension/monotonic due date, without stealing an existing cleanup claim.
3. Insert a second, **new** `account_export_orphan_cleanup` row, keyed by `(jobId, newClaimId)`, with `$setOnInsert` and `{upsert:true,session}`. This also applies to first pending claims. Its owner comes from the Mongo preimage, not a request parameter.
4. The new task's first due date is **original claim lease expiry + three 2-minute lease periods**. Its `verificationUntil` extends **one hour after that due time**. Both are durable in Mongo even if the worker never starts or exits during S3 upload.
5. Re-read the new claim in the same Mongo session. A failure at any phase, including write-ahead insert or postcondition read, aborts the transaction: **no claim returned, no S3 writer**.
6. On durable success, the normal B78 drainer eventually observes `job.artifactGeneration === candidate.generation` and ACKs the recovery intent **without deleting S3**. On a failed/rescheduled/abandoned attempt, the drainer can delete only after due time, owner/reference/current-lease checks and exact verification horizon/cleanup lease CAS. Repeated post-DELETE verification survives worker restart.

`B79` post-outcome enqueue is intentionally left as a redundant idempotent signal; `$setOnInsert` cannot shorten this durable write-ahead's due date or horizon.

## Behavior and boundaries

- **Permanent Mongo outage before claim:** claim transaction fails, so no new S3 write is permitted. The worker's existing `account_export.worker.iteration_failed` redacted diagnostic applies.
- **Mongo outage during/after S3:** claim's intent already committed; drainer later recovers without depending on B79 finishing its callbacks.
- **Abrupt process death, no bytes written:** intent remains; owner-fenced drainer safely cleans a potentially absent exact-generation key after its due date.
- **Successfully completed export:** intent eventually ACKs as preserved, without deleting the referenced object. Normal seven-day application TTL and eight-day bucket backstop remain unchanged.
- **Takeover:** old-generation ledger is still extended, and a fresh ledger is created for the new attempt in the **same transaction**. The old claimant cannot reset settlement/horizon by idempotent enqueue.
- **Historical generations created before B80**, incomplete multipart beyond bounded horizon, credentials/remote retention, versioned S3 noncurrent versions and the already-documented concurrent drainer-versus-takeover race are **not** automatically solved. Provider inventory and operator reconciliation remain release work.

## Tests and release evidence

- Executable dependency-free tests: `node --experimental-strip-types --test scripts/test-account-export-b80-writeahead.test.mjs` (validated plan, delayed due, horizon, unique attempt identity, invalid inputs).
- Jest store unit cases: pending claim now inserts one write-ahead, expired takeover inserts two generations' intents with protected $max updates, failure rolls back, invalid deadlines and per-claim horizon.
- Mongo replica-set opt-in: first-claim crash and resumed owner-fenced cleanup with repeated verification; Mongo write failure rolls back pending claim and retry commits both records; successful completion preserves S3 and ACKs its write-ahead. Also reconciles a B71 Mongo/S3 retry test to B78 queue-only semantics.
- Structural source contracts: `node scripts/test-account-export-b80-writeahead.mjs`; root account lifecycle chain also runs B74, B77, B78 and B79 checks.
- **Not a production acceptance claim:** Node24/pnpm9 full Jest/TS, real Mongo replica set, S3 provider multipart, HTTP/Chromium, backup/restore, IAM readback and global dependency audit remain to be executed. Run exact-head gates before lifting #353.

## Parallel work

PR #349 may contain stale snapshots of `mongo-account-export.store.ts` and associated tests. Rebase **only formatting** on the B80 main code; keep its new-claim ledger insert, old-takeover B77 logic, Jest and replica fixture, B79 metrics. PR #374 contains independent v3 allowlist/fences; do not replace B80 or remove release controls.
