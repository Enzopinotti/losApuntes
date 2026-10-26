# B221 — Fail-closed Account Export inventory on the current main

**Date:** 2026-10-25. **Current-main source:** `fb52a1d681d26767d1aa2402438bf9e1954157a7`.  
**Scope:** backend Account Export only. **Status:** Draft / release HOLD.

## Confirmed regression before B221

The historic [B76 PR #372](https://github.com/Enzopinotti/losApuntes/pull/372) added an allowlist check for *all* registered export contributors before writing any v1/v2/v3 artifact. The current `main` assembler lacks this check. It selects expected v1/v2 providers using `accountExportSectionIds(version)` and validates only the selected providers for legacy versions. An unknown additional private contributor present in the registry is therefore silently omitted from a v1/v2 artifact rather than rejected. The existing v3 path validates the full registry, but the same invariant should hold for persisted legacy jobs.

A successful export is not a safe indication of completeness when an unreviewed private data source is wired in. Changes in registry providers require explicit review and versioning, never silent success in a legacy artifact.

## Current-main reconciliation

- Port the narrow functional check from #372 **onto current main** and preserve current assembler behavior around credential authority, export epoch, bounded paging, SHA-256, writer claim and commit/abort.
- Validate *every* registered section against the 32-section reviewed v3 inventory before selecting the specific persisted job version. A new section requires explicit migration/version review before any export can proceed.
- For v1/v2, still export only the exact immutable 30/31-section manifests when the registry has current v3 known providers; no accidental Study Progress data in old versions. For v3, preserve the canonical complete manifest.
- On an unknown provider, throw before any contributor read, epoch capture, artifact write or commit. Do not reveal content from the unreviewed provider and do not try to downgrade the job version.
- Port the existing [#372](https://github.com/Enzopinotti/losApuntes/pull/372) adversarial Jest suite, including 3 negative tests (one per version) and 2 positive legacy compatibility tests, unchanged to preserve origin provenance.

## Verification

`.github/workflows/b221-export-contributor-allowlist.yml` enforces immutable PR head, Node24/pnpm9 frozen lock, full API strict TypeScript and ESLint, Prettier, focused Jest allowlist + existing assembler/versioning/module contracts, no audit exceptions and clean source after the run.

Global `verify` remains independent. High advisories [#133](https://github.com/Enzopinotti/losApuntes/issues/133) node-forge and [#705](https://github.com/Enzopinotti/losApuntes/issues/705) Zod still block production audit, even if the B221 test pipeline passes. No lockfile change, no waiver, no schema migration, no runtime flag change, no deployment.

## Coordination and closure decision

- **Source PR #372 remains untouched until this carrier passes exact-head verification.** If the current-main replacement passes, close the old Draft with a link to the new PR and test results, never mark it merged.
- Do not overwrite current parallel #713 (Study Progress owner GET and owner export read), #714 HTTP Auth, #711 audit runner or #712 browser smoke: this block changes only the Account Export assembler and new tests, workflow, document.
- Current issue [#353](https://github.com/Enzopinotti/losApuntes/issues/353) still requires genuine multi-account private-data acceptance and backup/restore before Study Progress activation. `STUDY_PROGRESS_ENABLED=false` remains mandatory.

**Release outcome:** HOLD / NO MERGE / NO DEPLOY until all required gates are green.
