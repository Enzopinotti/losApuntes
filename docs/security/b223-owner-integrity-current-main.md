# B223 — Consolidate B221 + B222 Account Export owner integrity on current main

**Base:** `main@0a73ac4b4291dffcb63774ccd761486dd5092061`, observed 2026-10-25.  
**Decision:** Draft / HOLD pending canonical audit and release #353. No deployment or activation.

## Why this integration replaces two stale PR carriers

The original B221 [#718](https://github.com/Enzopinotti/losApuntes/pull/718) and B222 [#719](https://github.com/Enzopinotti/losApuntes/pull/719) were both based on `main@fb52a1d681d26767d1aa2402438bf9e1954157a7` and individually passed their focused CI. Concurrent agents merged many Web/Mobile pagination fixes after that base, leaving both branches behind. Their changed production and test files are independent from one another, and each file on the newer main was verified **identical by Git blob SHA** to its original B221/B222 input. Rather than blindly merge old tree snapshots or create an ambiguous stacked PR, B223 copies only the reviewed source blobs onto a new exact-main branch.

## Two complementary, concrete safety contracts

### 1. Reject unreviewed private export contributors (B221)

Every registered Account Export section must belong to the reviewed v3 section inventory **before** any v1, v2 or v3 export proceeds. Previously, legacy v1/v2 could select their fixed 30/31 providers and omit unreviewed additional private providers, silently returning a successful artifact. This reconciliation ports the fail-closed production guard and retains the B76 adversarial fixture *byte-for-byte* by Git blob SHA.

The old B45 test asserting success with `unreviewed.private` was replaced in B221 with an early-refusal contract: **no reads, epoch capture, chunks or commit** when an unknown provider is registered. Version-pinned legacy exports still produce only their approved sections even when the known v3 registry is loaded.

### 2. Recheck the same owner's study progress epoch (B222)

The real v3 Account Export module fixture now proves that `getStudyProgressExportEpoch` reads **the same owner twice** (capture and pre-commit check). A simulated private owner mutation changes epoch 0→1 while the writer is active: v3 must reject with `Study progress changed during account export`, issue no commit, and abort staged output exactly once. V2 fixture explicitly performs **zero v3 owner epoch reads**.

This is a regression test against already-implemented domain behavior; it does not add a new API endpoint or enable Study Progress. Real two-account, transaction/replica, recovery, retention, authorization and cross-user acceptance remain independent release conditions.

## Exact blob inventory and release checks

| Path | Origin |
| --- | --- |
| `apps/api/src/data-lifecycle/domain/account-export-assembler.ts` | B221 #718 production allowlist |
| `apps/api/src/data-lifecycle/domain/account-export-versioning.spec.ts` | B221 #718 corrected B45 behavior |
| `apps/api/src/data-lifecycle/domain/account-export-contributor-allowlist.spec.ts` | B221 #718 unchanged B76 fixtures |
| `apps/api/src/data-lifecycle/data-lifecycle.module.spec.ts` | B222 #719 module epoch tests |
| `.github/workflows/b223-account-export-owner-integrity.yml` | new combined exact-head validation |

The dedicated B223 workflow uses immutable PR SHA, Node24/pnpm9 frozen lock, full API TypeScript + strict lint, pinned Prettier, the **five combined owner-sensitive Jest suites**, explicit no-audit-waivers policy and clean-worktree guard. This is stronger than running the old PRs independently because it exercises both checks **in the same code tree**.

### What this does not certify

- The mandatory global `pnpm audit --prod --audit-level high` still fails for Expo-related `node-forge` (#133) and `zod` (#705). No package overrides or audit exceptions were added.
- A passing dedicated workflow does not certify the Web Chromium smoke, actual two-user browser behavior, persistent Mongo replica backups, release legal acceptance, signed mobile distribution or live deployment.
- `STUDY_PROGRESS_ENABLED=false` stays required. [Release issue #353](https://github.com/Enzopinotti/losApuntes/issues/353) remains HOLD.

## Historical PR retirement protocol

Close #718 and #719 **as superseded, not merged**, only after successful B223 exact-head tests and Git blob equivalence have been rechecked. Never delete their branches or claim that closing them merged the code. B223 is the single replacement carrier to review. Re-run exact-head acceptance on whatever main SHA is current before any eventual merge; avoid races with other agents and respect failing HIGH/CRITICAL audit gates.
