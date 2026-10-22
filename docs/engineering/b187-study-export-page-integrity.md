# B187 — Fail-closed integrity of private Study Progress export pages

**Date:** 2026-10-21. **Scope:** B61 release follow-up, issue #353. **Base:** `main@6bd965c71f6426da3d49fc7c0555e0e5afda06a9`.

## What was already implemented

Do **not** recreate Account Export v3. The existing backend already owns a 32-section v3 manifest with `study.progress`; historic v1/v2 contain 30/31 sections, and the private export reader filters by owner, uses `{ownerUserId:1,subjectId:1}`, canonical cursors and strict plan validation. B63/B64/B65 protect owner epoch and account closure races. `STUDY_PROGRESS_ENABLED=false` by default and production activation is intentionally blocked.

## Actual remaining boundary

`StudyProgressExportReader` relied on the Mongo adapter returning a strictly ordered, nonduplicated, bounded `limit+1` array. If a future adapter or query refactor breaks that contract, a continued cursor can skip or repeat private progress while yielding an apparently valid export. A legacy record with `updatedAt < createdAt` was also projected as portable account data instead of failing.

## B187 implementation

- Confirm the complete fetched page, **including the lookahead row**, never exceeds the requested `limit+1` budget.
- Every returned Subject ID must be a canonical v4 UUID, strictly greater than the previous returned ID **and** the validated owner-bound cursor. Equal/reversed/overlapping rows abort the read rather than emitting a partial archive.
- Each projected row must have finite dates and `createdAt <= updatedAt`; malformed records abort the export.
- Do not alter owner filters, Mongo indexes, query projections, account export inventory, files, tasks, session authority, revision/epoch guards, flags, lockfile, or dependencies.

## Adversarial regression and CI

The new Jest cases cover duplicate rows, descending rows, adapter over-fetch, ignored continuation cursor, and impossible timestamps, in addition to the existing owner and corruption tests. The isolated workflow runs on **the PR's exact head** with Node 24 / frozen pnpm lock, zero-warning touched-file ESLint, Prettier, API TypeScript, and actual Jest suites for reader and contributor. Existing global `verify` and production dependency audit remain separate mandatory gates.

The change is a **fail-closed fix to already-approved export behavior**: no new functional requirement or version bump. No production or Mongo data has been modified. No CI or runtime PASS is claimed until results are observed for the final SHA.

## What B187 does NOT close

Issue #353 still requires operational data-retention decisions, off-host backup/restore and legal evidence, real two-user/device/S3/browser acceptance, rollback and audit clearance. HIGH vulnerabilities tracked in #133/#141 and the existing production feature block must not be waived. A green targeted suite is **not** release approval. PR stays Draft until exact-head quality and security gates, review and integration policy permit further action.
