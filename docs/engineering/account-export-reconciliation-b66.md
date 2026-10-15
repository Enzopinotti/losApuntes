# B66 — Durable reconciliation of ambiguous export completion

**Scope:** Account Export v1/v2/v3 worker, private S3 generations, Mongo job CAS. **Status:** code and acceptance cases committed; release gate #353 remains OPEN and production Study Progress is still disabled.

## Why this block exists

B65 made v3 completion transactional with its owner's mutation epoch and avoided deleting S3 after an uncertain Mongo commit. However, it could report `stale` for a job that actually reached `completed` (Mongo committed but the client lost its reply), and would leave a completed S3 upload orphaned even after a **successful retry/failure CAS** demonstrated that the attempt had never completed.

B66 turns that uncertainty into an explicit, evidence-based reconciliation workflow. It does not introduce new public APIs or expose private job generations to the owner.

## Recovery algorithm

After `sink.commit`, on a **thrown error from durable completion**, the worker:

1. Reads the stored export job through `AccountExportStore.findOwned(job.id, job.userId)`. A successful completion is accepted only if the durable row matches **job ID, owner, `state='completed'`, `active=false`, exact claim-scoped S3 generation, export format version, section count, record count, byte length, SHA-256 and finite `completedAt`**. If all agree, the worker reports `completed` and preserves S3. A missing row or failed read is **not proof** of completion.
2. If completion is not confirmed, attempts the existing `reschedule` CAS on the original claim. If that CAS succeeds, the original claim definitively did not publish. **Only now** may the worker delete `exports/{jobId}/{claimId}.json`. Cleanup errors do not undo the durable `pending` or `failed` state; bucket private lifecycle remains the backstop.
3. If `reschedule` CAS fails, rereads the durable job: the original transaction may have finished between the first read and CAS. If exact metadata now confirms that job, returns `completed`; otherwise returns `stale` **without deleting S3**.
4. If a definite `complete() === false` is returned, this claim has lost its CAS. Its generation can be deleted best-effort and the worker returns `stale` without treating S3 deletion failure as a new retry.
5. A known `AccountExportEpochConflictError` remains distinct: the transaction conclusively rejected the v3 owner revision, so cleanup follows the existing safe path.

The worker never deletes a generation solely because Mongo status is missing, a read failed, or a different claimant completed. A later claim always has its own UUID generation; a matched, referenced generation is never deleted during reconciliation.

## Compatibility and security

- Manifests and portable JSON unchanged: **v1 30 sections, v2 31, v3 32**.
- B64/B65 owner epoch, atomic v3 Mongo transaction, lease fencing, SHA-256/length checks, claim-scoped object keys and account authorization remain intact.
- The same uncertain-commit reconciliation also helps legacy jobs v1/v2; it does **not** add Study Progress epoch reads to them.
- No new S3 listing or read permissions; only existing `deleteArtifact(jobId,generation)`.
- No passwords, account IDs, claim identifiers, S3 keys or snapshots are added to user-facing status or export content.

## Test matrix

Jest worker cases include: lost acknowledgement with verified completed generation, late commit after failed reschedule CAS, successful CAS followed by deletion, CAS loss with no proof, rejection of wrong owner/generation/digest/manifest/active state/invalid completion time, failed read, failed S3 deletion, already exhausted retry budget, definite stale completion and v1/v2 lost replies.

Two opt-in Mongo replica-set tests in `study-progress.mongo-int.spec.ts` exercise:
- An **actual committed v3 Mongo transaction** whose client wrapper throws after commit, followed by the worker's real durable lookup that recovers `completed` without deletion or retry.
- A **real `reschedule` CAS** after an artificially uncertain completion. The S3 test double asserts the DB is already `pending` **before** deletion, proving ordering.

`scripts/test-account-export-b66-reconciliation.mjs` adds source-level guards and is connected to `pnpm test:account-lifecycle-contract`. Those structural checks are not substitutes for Jest/DB/S3 execution.

## Remaining acceptance / operational risks

- Run exact-head Node 24, pnpm 9.15.9, typecheck, Jest, lint/format, Mongo replica set, S3-compatible storage and HTTP/browser smoke on a complete checkout. **Not executed as part of this branch.** No manual CI was requested.
- If S3 delete fails after a proven CAS or a previous process crashes, orphan objects may remain until bucket lifecycle expiry. A durable orphan-cleanup queue and observability of cleanup debt are follow-up work.
- If the worker loses the connection during **`reschedule`** itself, the outcome remains uncertain and is surfaced; the S3 generation is preserved instead of guessing.
- This block does not provide a globally serializable snapshot of all 32 sections, nor backup/restore policy or legal retention acceptance.
- Production `STUDY_PROGRESS_ENABLED` is still OFF and the production configuration explicitly rejects turning it on. Issue #353 remains a release hold, without waivers for #133/#141.

**Parallel PRs:** #349 changes formatting around the worker/export lifecycle and #331 changes export v1 tests. Both must update against the B66 merge before integration, preserving the reconciliation read and CAS-before-delete order.
