# B82 — Canonical formatter on top of B81, preserving B80 export

**Date:** 2026-10-16. **Candidate parent:** [B81 #383](https://github.com/Enzopinotti/losApuntes/pull/383) `0ad2aa672711d315fe5dc38cff75a5df3f5f92ff`, itself based on `main@3579eab49f9d0ad3dd889731695f7a1a155e7efd` (B80). The original format PR [#377](https://github.com/Enzopinotti/losApuntes/pull/377) started from a pre-B81 source snapshot, and copying files from it would risk overwriting owner epoch, Study Collections CAS and B80 S3 write-ahead changes.

## Scope

1. Port only the **semantic React hook-dependency repairs** from #377 to the currently integrated B81 sources. `StudyKits` derives a stable selection of validated resource UUIDs plus selected kit ID, and each verification reads that snapshot under its authority ticket. `StudyRunner` observes the primitive clock started-at value in its interval instead of omitting mutable `activeClock` object from dependency validation. No new authority/permission behavior, storage format, or HTTP endpoints.
2. The temporary, branch-restricted `B82 format combined B81 sources once` workflow installs the project's locked `pnpm@9.15.9` and Node 24, executes `pnpm --filter @losapuntes/web format` and `pnpm --filter @losapuntes/api format` **on the exact B81-based SHA**. The result can update only `reconcile/b82-pinned-format-on-b81-current-main`, using a strict expected-head remote lease and a path allowlist for source TS/TSX. No change to `main` or other PRs.
3. The same workflow checks formatting, Web lint, Web types and API types on the formatted tree. A full new `verify` run on the formatted SHA is required separately: the original formatter workflow is not sufficient evidence for ten domain coverages or production auditing.

## Invariants and release gates

- Preserve CAS postconditions, owner epoch at prepublish, 32-section v3 allowlist, frozen v1/v2 manifests, B78/B79 queue-only S3 cleanup and B80 write-ahead ledger.
- Formatter must modify **only** Web/API TS/TSX source/test files. No scripts, dependencies, lockfiles, CI thresholds, security exception dates, API contracts, authorization boundaries, DB schema or S3 cleanup semantics.
- GitHub `verify` retains all original domain and build checks; never mark B82 integrated solely because Prettier succeeds. `ACCOUNT_EXPORT_FORMAT_VERSION=1`, disabled Study Progress, release issue #353 **HOLD**.
- Security audit still blocks on the expired `node-forge` exception (#133) and security issue #141. No automatic waiver, ignoreCVE addition or audit threshold reductions.
- If a newer `main` lands, compare changed paths and rerun exact-head validation before proposing a merge. Do not force merge, launch services, or deploy.

## Previous evidence

B81 [focal #38902042984](https://github.com/Enzopinotti/losApuntes/actions/runs/38902042984) passed six suites, 72 tests, API types and B77/B78/B79 contracts. [Global #38902043042](https://github.com/Enzopinotti/losApuntes/actions/runs/38902043042) passed 10/10 critical API coverage jobs but was red for old Web/API formatting and audit. **Those results are historical, not evidence for B82 HEAD.**
