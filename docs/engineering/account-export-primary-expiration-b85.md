# B85 — Mongo primary-time expiry for published account exports

**Base:** `main@dafce51d051e6eb58d6212a89901d5915523fdfd` (B84).  
**Release:** #353 OPEN/HOLD; `STUDY_PROGRESS_ENABLED=false` in production.

## Vulnerability and user impact

B83/B84 applied Mongo primary `$$NOW` to job and queue lease/due decisions. The retention path remained client-only: `MongoAccountExportStore.findExpiredArtifacts` selected completed artifacts using `artifactExpiresAt <= input.now`, and `retireExpiredArtifact` used that same timestamp in the transaction that unlinks `artifactGeneration` and registers a durable S3 deletion intent. A worker with a clock far ahead of the Mongo primary could retire a **still-valid, downloadable private export** before its seven-day TTL and enqueue deletion. B72 ensured reference unlink and cleanup were atomic, but did not independently verify the true expiry at the primary.

## B85 implemented

A small dependency-free `account-export-mongo-artifact-expiry.ts` exports `accountExportArtifactExpiredOnMongoServer()`, requiring:

```js
{ $expr: { $and: [
  { $eq: [{ $type: '$artifactExpiresAt' }, 'date'] },
  { $lte: ['$artifactExpiresAt', '$$NOW'] }
] } }
```

This predicate is embedded in **both**:
- The bounded candidate scan `findExpiredArtifacts` with its existing completed-state, generation-reference, and client-time index eligibility. Even an extreme future client clock cannot select an export before the primary sees its TTL elapsed.
- The exact `retireExpiredArtifact` `findOneAndUpdate` filter, with `id`, `state:'completed'`, precise generation, exact `expiresAt`, and `artifactExpiresAt <= input.now`. This is the **same document update in the existing Mongo transaction** that atomically inserts the S3 orphan cleanup intention. A stale candidate or premature worker cannot unlink or enqueue a deletion.

The original seven-day policy, owner/generation protection, monotonic B77 verification, B80 writeahead, B81 no implicit DELETE, B82/B83 late-completion CAS, B84 primary queue eligibility and S3 authorization are unchanged. Malformed or missing expiry fields fail closed by BSON Date type.

## Evidence

- **5/5 actual Node v22.16 tests PASS** via `node --experimental-strip-types --test scripts/test-account-export-b85-artifact-expiry.test.mjs`, executed locally against copied `.ts` source with **exact Git blob hashes** matching the branch (helper `b1c0e0f8d1c7ceff217b9f7218f844841883d460`, test `7c3b098ff89913d0a0f34c02ca26f2686ec40972`). The test interprets the real Mongo query expression but is **not a real MongoDB execution**.
- Jest store tests enforce the predicate on both selection and transactional CAS and require no orphan queue insert for a failed retirement.
- Isolated Mongo replica-set opt-in tests (not executed) verify an export whose TTL is ten minutes in the future is **still referenced with zero deletion intent** despite worker time after expiry; a truly expired export is retired **with an exact durable queue record**, not direct S3 DELETE.
- `scripts/test-account-export-b85-expiry-guard.mjs` structurally forbids separating the Mongo authorization from the transaction, or bypassing the S3 worker; both new tests are wired into the root lifecycle contract.

## Limits and release

Node24/pnpm9 complete API Jest/typecheck, actual local Mongo replica-set and S3 provider fault injection, object versioning/readback, backups, IAM/retention, security audits #133/#141 and HTTP/browser E2E are **not executed or approved** by this block. The static guard is not a substitute for server acceptance or a release waiver. **Keep issue #353 HOLD, `STUDY_PROGRESS_ENABLED=false`, no manual CI, no deployment.**

## Parallel work

Quality branches #390, #391, #393, #396, plus #349/#377/#383/#387/#388, may contain stale `mongo-account-export.store.ts`/specs or `study-progress.mongo-int.spec.ts` snapshots. Only rebase and apply compatible hunks on the exact integrated main; preserve the B85 filter, exact expiry/generation CAS, test fixes and B78–B84 protections.
