# B222 — Owner epoch checks in real Account Export module wiring

**Baseline:** `main@fb52a1d681d26767d1aa2402438bf9e1954157a7`.  
**Status:** Draft / HOLD. **Source carrier:** historical [#370 (B75)](https://github.com/Enzopinotti/losApuntes/pull/370).

## Missing test proof identified during PR cleanup

`main` already implements the owner-scoped Study Progress epoch capture and final recheck in `AccountExportAssembler` / `AccountExportService`. It also has a v3 module acceptance test exercising a 32-section artifact. However, unlike old Draft #370, the **actual module fixture did not assert the epoch read happened twice for the same user or that a changed epoch would cancel publication**. It only had a comment about the behavior and `jest.fn().mockResolvedValue(0)`. This gap makes it easy for future module wiring changes to accidentally skip the second check while other unit tests still pass.

## Targeted reconciliation on the current main

1. Replace only the local v3 `getStudyProgressExportEpoch` test double with a named Jest mock; assert it receives the owner ID **twice** (at capture and at pre-commit recheck).
2. Assert persisted legacy v2 (31-section) export never reads the v3 private epoch even when the test double is present.
3. In the same real v3 module/wired contributor test, reset the epoch double to resolve 0 then 1. Expect explicit `Study progress changed during account export` rejection and **no artifact commit**, plus exactly one staged artifact abort. This preserves the existing bounded `listAccountExportProgress(ownerId, {limit:100,cursor:null})` check.
4. A dedicated exact-head Node24/pnpm9 workflow verifies API Prettier, full strict API types/lint, module + assembler + versioning + AccountExportService Jest already present on main. B221 allowlist Jest remains exclusively in its separate unmerged #718 PR, zero audit exceptions and source SHA clean. Canonical CI remains independent and mandatory.

## Authority boundaries

This is **tests-only backend behavior verification**, not a new API endpoint, client functionality, production implementation of epoch transactionality, or a genuine two-account / Mongo replica acceptance. The real live replica race, artifact storage recovery and legal/retention scenarios belong to release issue [#353](https://github.com/Enzopinotti/losApuntes/issues/353). Do not enable `STUDY_PROGRESS_ENABLED` or alter Auth/exports to accommodate fixtures.

## Parallel PR and closeout discipline

- [#718 B221](https://github.com/Enzopinotti/losApuntes/pull/718) restores the contributor allowlist check. B222 does **not** change its production assembler, legacy versioning test or fixture file, and instead ensures the real Nest module consumes the correct v3 private epoch gate.
- Historical #370 must stay open until the exact-head B222 tests and versioning compatibility pass; if they do, close the historical PR as superseded **without merging**, retaining its history.
- Do not duplicate #711 audit runner, #712 Auth browser, #713 private owner export, #714 HTTP Auth or #715-#717 Mobile and API dependency security lanes.

**Release remains HOLD** on HIGH [node-forge #133](https://github.com/Enzopinotti/losApuntes/issues/133) and [Zod #705](https://github.com/Enzopinotti/losApuntes/issues/705). The GitHub HIGH/CRITICAL audit stays enforced, irrespective of local test success. No bypass, lockfile update, deployment or unsafe merge.
