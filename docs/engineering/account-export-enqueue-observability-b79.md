# B79 — Bounded enqueue recovery and private worker observability

**Project:** Los Apuntes 2026, private account-export cleanup.  
**Base:** `main@251a0ec96c6cf7491b354b90b54fff24f7833284` (B78).  
**Release:** issue #353 OPEN/HOLD. `STUDY_PROGRESS_ENABLED=false` remains the production requirement.

## Problem after B78

B78 correctly stopped orphaned export attempts from directly deleting S3. But when `MongoAccountExportOrphanCleanupStore.enqueue` failed, `deleteOrEnqueueProvenOrphan` silently swallowed the exception. After a successful durable export-job transition (or a confirmed stale claim), the old generation had no guaranteed durable cleanup task and no dedicated operational signal. Bucket lifecycle remained the only fallback. A one-off Mongo interruption could therefore leave an otherwise recoverable orphan unqueued.

## B79 functional behavior

- An export attempt may enqueue **only an already-proven orphan generation** after the existing authority/CAS rules. This contract remains unchanged.
- Its queue write retries at most **three times total**, with short bounded waits of **50 ms** and **100 ms** after the first and second failures. The same exact job/user/generation is used on every attempt, while Mongo's `$setOnInsert` ensures existing takeover deadlines, cleanup leases and claimant authority are unchanged.
- Success on retry counts as `orphanEnqueueRecovered`; each subsequent attempt counts as `orphanEnqueueRetries`; exhaustion increments `orphanEnqueueFailures` once per orphan. Counters live inside each `AccountExportIteration`, not mutable service-wide state.
- The worker emits an additional redacted `account_export.worker.orphan_enqueue_failed` WARN **only when one or more intents exhausted retries**. Payload includes `failedCount` and `retryCount`; never log owner/job/generation/object key, URL, payload or provider error content.
- The worker keeps the originally established `stale`, `failed` or `retryScheduled` outcome. A Mongo queue outage cannot authorize a direct S3 delete or rewrite a completed export. Existing owner validation, due + lease reclaim, horizon-fenced renew/retry/ACK and B78 queue-only deletion remain.
- A permanent Mongo outage is **not** a durable write. Operators must investigate the alert, reconcile the missing queue intent from authorized records or storage inventory, and verify bucket lifecycle. This block does **not** add a false claim of automatically recovering a generation after every process crash.

## Acceptance

- Dependency-free Node test `node --experimental-strip-types --test scripts/test-account-export-b79-enqueue.test.mjs` validates immediate success, one/two transient failures, exhausted failures, exact retry count/backoff and per-iteration isolation with fake sleeps.
- Existing `account-export-processor.spec.ts` covers permanent failures without S3 deletion, recovered transient queue errors, multi-claim aggregation, completed export without orphan and legacy B71 ACK-loss retry, plus opt-in B78 Mongo takeover invariants.
- `scripts/test-account-export-b79-observability.mjs` checks source-to-worker wiring and redacted warning contract, and B78 source guard remains included. Added these to the existing root `test:account-lifecycle-contract` chain.
- Node unit tests are narrower than API Jest, full TypeScript, Mongo replica set, real S3/HTTP and backup/restore. Do not claim release readiness until the exact-main runtime gates and #353 acceptance are complete.

## Integration / risks

B79 edits the processor/spec overlapped by the stale formatting carrier PR #349. Port the formatter as hunks onto the latest main, never replace this block with an older snapshot. PR #374 touches independent v3/cross-agent fixtures. Preserve the security contradiction: no S3 fallback after Mongo enqueue failure. Security audit issues #133/#141 and production flag remain unchanged.

**Next operational gap:** provider object-version lifecycle audit and durable recovery for a process that crashes during a permanently unavailable Mongo queue. B79 reduces risk and surfaces it; it does not eliminate it.
