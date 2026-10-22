# B82 — Fence stale Mongo completion before deleting current export generation

**Base:** `main@a27a4e2a60f3ea993ee2d52e5303a55a33981a49` (B81).  
**Release:** #353 OPEN/HOLD; `STUDY_PROGRESS_ENABLED=false` in production.

## Race identified after B78–B81

B78 verifies durable owner/reference and renews the cleanup queue claim before S3 DELETE. B80 proactively writes a durable cleanup intention before staging S3; B81 prevents direct DELETE from a failed writer abort. One publication race remained:

1. Worker A begins `complete({ completedAt: T-before-expiry })` and its Mongo write/transaction stalls.
2. The job's original processing lease expires. Worker B's cleanup drainer reads the `processing` row with `claimId = generation` and expired `leaseExpiresAt`.
3. B previously only checked “lease not in the future” in process memory; it then sent an exact object DELETE.
4. A's delayed Mongo completion may commit **after** B's authority read using its earlier `completedAt` timestamp. The CAS in `complete` still matches the original lease and generation, so the job becomes **completed with a missing S3 artifact**.

A second Mongo read cannot eliminate the race: a commit can win in the interval between read and S3 DELETE.

## B82 CAS protocol

- New server-only `AccountExportStore.fenceExpiredClaimForOrphanCleanup({ id, ownerUserId, generation, now })` with **one Mongo updateOne CAS** on the same job document as `complete()`, `claimNext()`, `renewLease()`.
- Exact filter: `id`, `userId`, `active:true`, `state:'processing'`, `claimId:generation`, **expired date lease**, `artifactGeneration:null`.
- On CAS success transition **only this generation** to `pending`, clear `claimId`/`leaseExpiresAt`, set `nextAttemptAt=now` and `EXPORT_ASSEMBLY_RETRY`. Do not touch attempts or newer generations; the claim is reissued using B80's transactional new-generation ledger.
- A completed export wins the shared-document CAS first: revocation fails and S3 DELETE is blocked. A renewed lease or newer claim also makes revocation fail.
- If revocation wins first: any late completion, even with an earlier `completedAt` passed to Mongo, loses the state/claim CAS and cannot publish the generation later deleted.
- The drainer calls revocation **only** when `job.state='processing'` and `job.claimId === candidate.generation`. A missing/malformed current lease fails closed. If the CAS returns false or throws, mark the iteration blocked/retry and perform **no S3 operation**.
- Different current generation: preserve existing B74/B77 takeover/lease/horizon checks. Referenced `job.artifactGeneration === candidate.generation` remains protected and ACKed with no S3 DELETE. Existing queue lease recheck before S3, heartbeat, re-verification and bounded retry stay active.
- The pure plan `planAccountExportExpiredClaimFence` validates critical inputs and feeds both Mongo and dependency-free executable tests, so the contract is not silently split across implementations.

## Tests

- Runnable `node --experimental-strip-types --test scripts/test-account-export-b82-fence.test.mjs` checks exact filter, revocation update, identity rejection and semantic nonmatches after completion/renewal/takeover. This alone does **not** simulate concurrent Mongo transactions.
- Jest store tests assert exact Mongo `updateOne` filter/update and handling of CAS conflicts and invalid input.
- Processor Jest tests enforce revocation-before-queue-renewal-before-S3 order, completion-wins fail-closed behavior, malformed lease rejection, and no modification of a **different** current claim.
- Replica-set opt-in tests (not a real S3 provider) verify both opposite Mongo outcomes using delayed-completion timestamps: **cleanup-wins → job pending, late complete false**, **complete-wins → published object preserved and queue ACKed**, plus **renewal-wins → revocation false**.
- `scripts/test-account-export-b82-fence-guard.mjs` blocks the old in-memory-only lease check; root `test:account-lifecycle-contract` runs both new suites.

## Remaining limits

The document CAS closes the identified *current-generation* commit-vs-cleanup ordering. It does not guarantee S3 multipart cancellation settling, provider read/write semantics, S3 versioned noncurrent cleanup, protection against unrelated manual bucket DELETEs, or proof of zero races in other app subsystems. **No full Node24+pnpm9 Jest/typecheck, opt-in local Mongo replica, real S3 multipart or HTTP/browser acceptance** can be declared from source checks alone. Keep #353 HOLD, dependency gates #133/#141, cloud IAM, backup/restore and lifecycle verification.

Concurrent PRs #386 and #377 include or may include older source snapshots. Rebase on exact `main` and merge only nonfunctional hunks, **retaining** `fenceExpiredClaimForOrphanCleanup`, its planner, callback and tests. Preserve B77/B78/B79/B80/B81 contracts. Avoid triggering CI manually.
