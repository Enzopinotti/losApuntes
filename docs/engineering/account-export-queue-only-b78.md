# B78 — No direct S3 DELETE from failed account-export attempts

**Base:** main@56c83fe117000801d3d08d1759946b0ff95fa778. **Release:** #353 remains OPEN/HOLD. `STUDY_PROGRESS_ENABLED` remains OFF in production.

## Defect
B74–B77 made the cleanup worker respect a three-lease settling date and a bounded one-hour late-multipart verification horizon. However, `AccountExportProcessor.deleteOrEnqueueProvenOrphan` enqueued a task and then executed an immediate S3 DELETE on the old worker. An enqueue that matched an existing takeover task retained the future dates, but the direct DELETE bypassed them. Even a failed enqueue triggered best-effort direct deletion.

## Correction
- Every proven orphan from a rejected completion, lost lease before Mongo completion or successful reschedule CAS is **only enqueued** by the failed export attempt.
- The standalone cleanup drainer is the only path in this processor permitted to DELETE a generation. It reads the durable owner and job, rejects referenced and live-leased generations, obtains a fenced cleanup lease and preserves takeover verification/retry dates.
- `enqueue` remains idempotent (`$setOnInsert`), so a late stale writer cannot reset `nextAttemptAt`, `verificationUntil`, claim state or lease of a takeover ledger.
- If Mongo enqueue fails, the attempt does **not** delete S3 as a fallback. Operators must reconcile and rely on configured bucket lifecycle as an independent last resort. A successful job outcome is not reclassified by a cleanup outage.
- Cleanup is now asynchronous even for ordinary proven orphans: a later worker iteration owns deletion. No new public endpoints or metadata leak.

## Proof and acceptance
Updated Jest cases cover successful queue-only deferral, lost lease, an ambiguous multipart completion, a failed enqueue, CAS ordering and a separate subsequent claimed cleanup iteration. The B69 replica-set scenario now verifies worker restart, one transient S3 deletion outage and a durable retry. A new opt-in Mongo scenario creates an expired claim takeover and verifies that a stale worker's late callback cannot DELETE or shorten the three-lease due date / one-hour verification horizon.

`node scripts/test-account-export-b78-queue.mjs` checks structural regression invariants; B69 and B71 source guards were reconciled with stronger queue-only semantics. This **is not** Jest, replica-set, real S3 or HTTP acceptance. Full exact-head TypeScript/Jest/replica-set/S3 fault-injection and infrastructure-readback gates are still pending.

## Limits
This avoids an unauthorized *fast-path* DELETE, not all possible distributed S3 races. An already-running drainer may experience a concurrent job takeover after its owner read/lease renewal, and storage may complete multipart activity outside the bounded horizon. Provider lifecycle, noncurrent versions, backup retention, inventory and real concurrency testing remain mandatory. Never enable production on the strength of source assertions alone.

**Cross-agent coordination:** PR #349 overlaps processor + Jest formatting; integrate B78 logic and update historical expectations before applying its formatter snapshot. PR #374 changes a different orphan-store Jest fixture; do not replace B77 due/lease/CAS changes. Keep #331/#372 and manifest v1/v2/v3 inventories untouched.
