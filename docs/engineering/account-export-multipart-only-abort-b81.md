# B81 — No implicit account-export S3 object DELETE during abort

**Base:** `main@3579eab49f9d0ad3dd889731695f7a1a155e7efd` (B80).  
**Release:** #353 remains OPEN/HOLD; `STUDY_PROGRESS_ENABLED` OFF in production.

## Critical bypass found

`AccountExportProcessor.processClaim` correctly defers S3 deletion to the B78 owner-checked orphan cleanup worker after a failed/rescheduled/stale export. However, when an assembler or a one-part/multipart `complete()` call threw, `processClaim` also invoked `sink.abort()`.

That sink forwards to `S3ObjectStorage.createMultipartWriter(...).abort()`, whose generic implementation performed an unconditional **exact-object `DELETE` after aborting the multipart upload ID**. This second path bypassed the B78/B80 Mongo durable authority, due/lease/verification horizon, even if the S3 object had already committed and only the provider ACK was lost. A late old worker can arrive after takeover extended the verification horizon; the hidden object DELETE would ignore it.

## Corrective behavior

- The shared S3 writer now takes **optional** `deleteObjectOnAbort?: boolean`. **Default remains true** for all legacy callers and standalone files workflows. No change to their compatibility.
- `S3AccountExportArtifactStorage.createSink` **always passes `deleteObjectOnAbort: false`**, including format v1/v2/v3 and all attempt-scoped object keys.
- Private export abort with a live `uploadId`: sends **multipart abort by uploadId** only, not a bare `DELETE` on the object key. This may cancel unfinished parts but does not authorize deletion of an object if the multipart completion was already committed.
- Private export abort of an ambiguous **single PUT**: sends **no DELETE request**. The object may exist despite a lost response; the earlier B80 transaction persisted an orphan cleanup intention before the worker wrote a byte.
- Cleanup remains the responsibility of the existing B78 worker with exact job/owner/reference, active claim, queue lease, due date and horizon fences. The explicit `deleteArtifact` method and its UUID validation are unchanged.
- A normal successful download and its seven-day expiry/retirement lifecycle remain unchanged. No public endpoint, auth, S3 bucket permissions, manifest sections (v1=30/v2=31/v3=32) or feature flags were widened.

## Fault-injection coverage

- Standalone dependency-free Node suite `scripts/test-account-export-b81-s3-abort.test.mjs` calls the **real `createS3ObjectStorage` implementation** with a mocked `fetch`, checking the exact HTTP method and S3 query after single PUT ACK loss, multipart completion ACK loss, unfinished multipart cancellation, and the unchanged legacy default.
- Jest `s3-object-storage.spec.ts` separately asserts both ambiguous paths and ensures no bare object DELETE occurs; existing generic abort test requires the legacy object DELETE to remain.
- Jest `account-export-artifact-storage.spec.ts` requires the private adapter's strict option and shows a lost commit response invokes abort but not `deleteObject`; an explicit cleanup operation is still available.
- `scripts/test-account-export-b81-abort-guard.mjs` blocks future removal of the strict option, provider guard or queue-only authority; both checks added to root `test:account-lifecycle-contract`.
- The obsolete historical B71 source regex for the B79 three-argument helper was updated, without changing production behavior.

## Limits and remaining acceptance

This removes an additional **unfenced object DELETE** during writer abort, but does not prove S3 read-after-write semantics, stop all concurrent takeover-versus-cleaner races, prevent multipart completion outside B80's bounded horizon, or guarantee cleanup of legacy pre-B80 objects. Provider versioning/noncurrent version policy, backups, retention and lifecycle readback remain release requirements.

**Tests must be run on the exact integration SHA:** Node24/pnpm9, Jest/typecheck and Mongo replica-set with real S3 fault injection, HTTP/browser smokes and audit #133/#141. Source assertions alone are not a passing runtime gate. Preserve #353 HOLD and do not enable production on the basis of this block.

## Parallel coordination

PR #377 includes stale snapshots of `apps/api/src/files/storage/s3-object-storage.ts`, `account-export-artifact-storage.ts/.spec.ts`. Preserve the B81 abort option and its tests when reconciling formatter changes. #349 overlaps processor and other export files; keep B78/B79. #383 and #382 are separate QA tracks; reconcile only changed hunks after reviewing current main.
