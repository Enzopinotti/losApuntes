# B70 — Fail-closed cleanup authority and reproducible local acceptance

**Baseline:** `main@1a3d869a813e4a1adf9c4e6b468cbfa5c955ce7d` (B69). **Scope:** internal private export cleanup, no public API, Auth or manifest changes. **Release gate:** #353 stays OPEN; `STUDY_PROGRESS_ENABLED` remains forbidden in production.

## Risk confirmed in B67–B69

The durable orphan-cleanup worker used `findForOrphanCleanup(jobId)` and checked owner when a record existed. However, it allowed S3 DELETE **if the record was missing**. A missing record is not proof that a private object is unreferenced: it may indicate a corrupt queue entry, archival/retention inconsistency, transaction visibility, an accidental job deletion or an outage represented incorrectly by an adapter.

The worker also preserved a queue generation only when the job had `state='completed'`. A row in another state that nevertheless retained `artifactGeneration` could refer to recoverable private bytes and should **not** be deleted solely due to the state label.

## Implemented safety changes

1. **Missing authority fails closed.** The compensator requires a durable export job to exist. If the authoritative lookup returns `null`, it increments `orphanAuthorityBlocked`, refuses S3 DELETE/ACK and reschedules the **same** queue task via the existing lease/CAS/backoff. It does not remove the intent or manufacture success.
2. **Owner and job ID remain authoritative.** Mismatch of `job.id` or `job.userId` versus queued values blocks deletion, increments the same metric, and retries without logging private identifiers.
3. **Any referenced generation is protected.** If `job.artifactGeneration === candidate.generation`, the cleanup worker preserves that generation regardless of `pending/processing/failed/completed` state. The task is acknowledged as preserved under claim CAS; if the ACK loses, it is not misreported as protected.
4. **Valid orphans still work.** A real owner-matched job with no matching artifact reference and no live matching processing claim can proceed through the B68 pre-S3 lease renewal, S3 heartbeat, idempotent exact-generation DELETE and fenced ACK.
5. **Operational metrics.** The worker reports aggregate `orphanAuthorityBlocked` alongside `orphanDeleted`, `orphanPreserved`, and `orphanRetries`. The values contain no owner ID, job ID, object key or private content.

This chooses safety over guaranteed cleanup. A task with genuinely absent authority may remain pending indefinitely, with increasing retry count; an operator must repair or account for missing authority. The isolated S3 bucket lifecycle is still the retention backstop, and a queue entry is not authority to manually delete a private artifact.

## Acceptance added

- Jest: null durable job → blocked, no S3 DELETE or ACK, durable retry; unavailable Mongo authority → retry; referenced generation in `pending`, `processing` or `failed` → preserve; wrong job ID → reject. B67/B68 fixtures now use valid pending job rows rather than implicitly relying on null→delete.
- Local Mongo replica-set opt-in acceptance: missing job but queued generation persists with backoff, no S3 DELETE; a stored nonterminal job referencing that generation is preserved without deletion.
- Reconciled B67/B68 structural guards to verify protection by **generation reference**, not only `completed` state.
- `scripts/test-account-export-b70-authority.mjs` added to `pnpm test:account-lifecycle-contract`.

## Reproducible executable acceptance (new)

The new `scripts/accept-account-export-b70.mjs` is a **local-only** runner that refuses to start unless:

- Node.js major version 24 and pnpm 9.15.9 match repo policy.
- Git checkout is clean and `HEAD` exactly matches the explicitly supplied SHA.
- `STUDY_PROGRESS_TEST_MONGO_URI` is an opt-in `mongodb:` URI for `localhost`, `127.0.0.1` or Docker host `mongo`, without credentials and with a `replicaSet` parameter. The Mongo test suite further validates that every advertised replica member is local.

Example, from a clean checkout with an ephemeral local replica set:

```bash
export STUDY_PROGRESS_TEST_MONGO_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0'
pnpm install --frozen-lockfile
pnpm accept:account-export:b70 --expected-sha <EXACT_40_CHARACTER_MAIN_SHA>
```

The script executes in sequence: API TypeScript typecheck, focused account-export Jest, historical account-lifecycle contract scripts B63–B70, and local Mongo replica-set integration. It stops on the first failure and emits a sanitized JSON summary to the OS temp directory `losapuntes-export-b70-<sha>.json`, retaining stage status and exit codes but **never** Mongo URI, secrets or payloads. The evidence explicitly marks S3-provider E2E and HTTP/browser acceptance as `NOT_RUN` and production release as `HOLD`.

**Important:** The runner and Jest scenarios were committed but **not executed in this GitHub-only development lane**. The local container available here has Node 22, no pnpm, no complete repository checkout, no running replica set, and cannot resolve github.com. A source-level verification is not TypeScript/Jest/Mongo/S3 PASS.

## Remaining release requirements

- Execute the local B70 acceptance runner on the exact merged `main` commit and fix any actual compile or runtime failures before declaring it passed.
- Execute a separate private real S3-compatible provider scenario, including ambiguous upload completion, lost ACK, S3 outages, key versioning/noncurrent expiration and non-idempotent provider behaviors.
- Finish HTTP/download/browser, backups/restore, privacy and retention sign-off.
- Do not close release issue #353 or enable Study Progress in production based solely on this block. PRs #349 and #331 must preserve the new authority checks, B70 specs and historical test semantics when rebased.
