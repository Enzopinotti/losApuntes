# B163 current-main integration evidence

**Date:** 22 October 2026 (ART)
**Current-main base:** `e303d3f1b8ffa28d2799fa0e592169b63642b6df` (`origin/main` at validation)
**Source PR:** [#493](https://github.com/Enzopinotti/losApuntes/pull/493), published HEAD `74ee65199f9819a8d44860ffaad0613f172ee768` (original PR base `6bd965c71f6426da3d49fc7c0555e0e5afda06a9`).

## Carrier scope

The carrier preserves the ten source commits that implement, test, format and document the B163 route recovery. The two source commits that only changed `.github/workflows/b163-not-found-recovery.yml` were omitted (`5ede9370b41568b905e207cedbaafe2d47644826` and `c238ad9f2ac75beda1bcb4246adb3fc193d1190c`). One separate atomic style commit formats the two changed local regression scripts; this evidence is another separate documentation commit.

The feature block changes six files: the nested Web wildcard and NotFound view/style, navigation and Chromium regression scripts, and the feature contract. This carrier has 15 atomic commits ahead of the stated base, including the preserved feature commits and separate formatting/evidence commits. It adds no API, database, dependency, lockfile, workflow, or protection changes.

## Local validation

On the carrier rebased onto `main@e303d3f1`:

- `corepack pnpm test:web-navigation-contract` — PASS.
- `node scripts/test-web-not-found-browser.mjs` — PASS in real local Chromium; checks token non-disclosure, guest/member recovery links, a guarded route, and valid-route precedence.
- `corepack pnpm --filter @losapuntes/web check:types` — PASS.
- `corepack pnpm --filter @losapuntes/web lint` — PASS with zero warnings.
- `corepack pnpm@9.15.9 -r --if-present format:check` — PASS for API, Web and Mobile workspaces. The root `format:check` wrapper could not start under the runtime's default pnpm 11.25.0, so the equivalent recursive command used the repository-pinned pnpm 9.15.9.
- Prettier on the changed Web feature files, feature contract and integration evidence — PASS.
- `corepack pnpm --filter @losapuntes/web build` and release-manifest check — PASS. The build reports existing Sass `@import` deprecations and a large-chunk warning.
- `git diff --check origin/main...HEAD` — PASS.
- No CI was manually run. A push may cause GitHub's configured automation to run normally.

The previously recorded read-only production audit found 2 HIGH (`node-forge`, `braces`) and 3 MODERATE on the dependency baseline. This feature does not change dependencies. That separate release qualification does not authorize changing workflows or protections, and this PR does not claim a deployment approval.
