# B163 current-main integration evidence

**Date:** 22 October 2026 (ART)
**Current-main base:** `bdfcc0433af9faccf28bdb38ee4d2ee538be1010`
**Source PR:** [#493](https://github.com/Enzopinotti/losApuntes/pull/493), source HEAD `74ee65199f9819a8d44860ffaad0613f172ee768`.

## Carrier scope

The carrier preserves the ten source commits that implement, test, format and document the B163 route recovery. The two source commits that only changed `.github/workflows/b163-not-found-recovery.yml` were omitted (`5ede9370b41568b905e207cedbaafe2d47644826` and `c238ad9f2ac75beda1bcb4246adb3fc193d1190c`). One separate atomic style commit formats the two changed local regression scripts; this evidence is another separate documentation commit.

The resulting block changes six files: the nested Web wildcard and NotFound view/style, navigation and Chromium regression scripts, and the feature contract. It adds no API, database, dependency, lockfile, workflow, or protection changes.

## Local validation

On the current-main carrier, before this evidence-only commit:

- `corepack pnpm test:web-navigation-contract` — PASS.
- `node scripts/test-web-not-found-browser.mjs` — PASS in real local Chromium; checks token non-disclosure, guest/member recovery links, a guarded route, and valid-route precedence.
- `corepack pnpm --filter @losapuntes/web check:types` — PASS.
- `corepack pnpm --filter @losapuntes/web lint` — PASS with zero warnings.
- `corepack pnpm --filter @losapuntes/web format:check` — PASS.
- Prettier on all six feature, contract and regression files — PASS.
- `corepack pnpm --filter @losapuntes/web build` and release-manifest check — PASS. The build reports existing Sass `@import` deprecations and a large-chunk warning.
- `git diff --check origin/main...HEAD` — PASS.
- No CI was manually run.

The read-only production audit `corepack pnpm audit --prod --audit-level high` still fails on the current dependency baseline: 2 HIGH (`node-forge`, `braces`) and 3 MODERATE. This feature does not change dependencies. Release qualification remains subject to the existing security hold; no waiver or workflow change is included here.
