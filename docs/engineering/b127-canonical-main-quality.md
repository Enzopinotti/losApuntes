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

## Executed B127 red-green evidence

The initial [B127 read-only #39182347518](https://github.com/Enzopinotti/losApuntes/actions/runs/39182347518) reported only **3 outstanding API Prettier files** after 64 provenance-checked Q91 blobs were carried forward; these were the B124 fixtures `account-export.controller.spec.ts`, `mongo-account-export.store.spec.ts` and `study-progress-export.reader.spec.ts`. The canonical output was produced in the repository's **actual frozen Node24** environment. All three were then committed **together** to the B127 branch, with their B124 typed fixture semantics preserved. The temporary formatter dump step was deleted; final checks run without modifying the checkout.

On [B127 format run #39182596510](https://github.com/Enzopinotti/losApuntes/actions/runs/39182596510), the exact branch passed **full API, full Web and full Mobile Prettier**, **full API and Web TypeScript** and **Web lint** under `contents:read`. The final SHA after this document and the B116 guard must independently rerun those same checks.

The old Q91 branch had additionally repaired `scripts/test-account-export-b116-guard.mjs`: its source assertion still expected unvalidated raw S3 HEAD ETags, despite B119 having made `normalizeS3HeadObjectEtag` mandatory. B127 ports **only this targeted guard correction** onto main, then runs B115/B116 native checks from read-only CI so formatting cannot conceal a changed source contract.

**Remaining failures are explicit, not silently skipped:** the independent full API strict lint job reported **886 errors and 77 warnings** on the initial B127 SHA (old fixture/lint backlog), despite all API/Web/Mobile format checks being fixed. Global `verify` still has Quality Gate FAIL and Production dependency audit FAIL while all 10 coverage groups PASS. Separate B90/B89 quality fixture PRs and a future type-safe lint remediation need careful fresh-main reconciliation.

The production audit expiration remains a **security veto**, not a cosmetic warning: `security/audit-exceptions.json` expired **2026-10-15T00:00:00.000Z** for `node-forge@1.4.0` / `CVE-2026-85393` / `GHSA-86w9-cpqp-85rv`, transitively from Mobile Expo code-signing tools. [GitHub's reviewed advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv) currently lists affected `<=1.4.0` with **no patched version**. B127 does not extend the expired exception, patch vulnerable code without evidence, remove the audit, or misrepresent this as a resolved release issue. It calls for a separate upstream/removal/migration evaluation under issue #133.

**No deployment and #353 remains OPEN/HOLD.**
