# B127 — Canonical current-main formatting without overwriting B124–B126

**Base:** `main@61e05dea8ec6b7178cdad259b87fb5ee770bbee9` (B126). **Release:** `#353 OPEN/HOLD`, `STUDY_PROGRESS_ENABLED=false`.

## Why old Q91 cannot merge directly

PR #445 was built from B123 `ef0ed1fcd56727588d7532b047da55f77f89f21c`, before the B124 typed export fixtures, B125 S3 safety coverage, and the B126 Mongo real acceptance. Merging the earlier snapshots of four changed files can undo those fixes. B127 uses Git blob SHA comparisons and carries over **only 64 exact-format source blobs from Q91 whose original contents remained unmodified since B123**: 54 API and 10 Web. The four conflicts from subsequent legitimate development are excluded and must be formatted from the authoritative main version instead:

- `apps/api/src/data-lifecycle/account-export.controller.spec.ts` (B124 4 typed B92 mismatch rows)
- `apps/api/src/data-lifecycle/mongo/mongo-account-export.store.spec.ts` (B124 typed jest updates)
- `apps/api/src/study-progress/mongo/study-progress-export.reader.spec.ts` (B124 malformed persisted plan)
- `apps/api/src/study-collections/mongo/study-collection-lifecycle.mongo-int.spec.ts` (B126 strictly local 13-case real Mongo replica)

No old source is substituted for these current-main files. The latest study-collection fixture already passes canonical Prettier in B126; the B124 fixtures need reformatting. No source coverage threshold, production logic, permissions, feature flag, dependency lockfile, or exception expiration changes.

## Read-only exact-head verification

`.github/workflows/b127-canonical-main-quality.yml` checks API/Web/Mobile Prettier, full API/Web TypeScript, Web hooks lint, strict API lint and clean SHA/worktree with Node 24 and a frozen pnpm graph. It carries `contents: read` only, has no workflow dispatch or deployment, and will not ignore any failing gate. All claims must be based on a completed GitHub Actions job on the exact final SHA.

Existing mandatory `verify` still evaluates all 10 critical coverage groups, full smoke dependencies and security audit. An expired `node-forge` governed audit exception dated 2026-10-15 must **not** be silently extended or excluded. Format success cannot alone release Study Progress.

## Scope and handoff

This B127 branch is the canonical replacement for the older Q91 formatting branch; Q91 must not be merged blindly. Review exact diffs and validated tests before merging. Continue release dependencies #133/#141 and #353 separately and keep HOLD until they are resolved with actual evidence.
