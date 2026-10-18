# Q91 — Canonical Prettier on authoritative B123 main

**Date:** 2026-10-18. **Base:** `main@ef0ed1fcd56727588d7532b047da55f77f89f21c`, after B123 shared Jest failures were actually fixed and merged into main. This replaces the old planned B91 regression-patch block because those same four suites already have their own successful focused acceptance in `B123 shared Jest regression acceptance`. Do not reintroduce historic fixture copies from #405/#408/#434/#437.

## Problem

The B116 [global verify #39138147814](https://github.com/Enzopinotti/losApuntes/actions/runs/39138147814) failed over formatting on ten Web and about 57 API files, plus independent quality/security gates. Main has since added B117–B123 Mongo/S3 acceptance and test fixes, so importing formatted snapshots from B82/B87 would overwrite newer code. Format the **actual B123 source tree** using the repository's frozen pnpm and Node24 toolchain.

## Scoped formatting contract

- Temporary `q91-once-canonical-format.yml` checks PR exact SHA, a clean checkout, its own branch name and remote ref, then installs dependencies with `pnpm install --frozen-lockfile`.
- It runs the **canonical API formatter first**, and commits only `apps/api/(src|test)/**/*.ts`; then runs the **canonical Web formatter** and commits only `apps/web/src/**/*.{ts,tsx}`, `apps/web/vite.config.ts` and `apps/web/release-manifest.ts`. Two separate, real logical style commits; no no-op commit for an already formatted area.
- It verifies `format:check` for API, Web and Mobile and pushes only to its own branch with a lease tied to the exact original SHA, without force-writing any parallel changes. No source-logic transformations, lockfiles, feature flags, security waivers, test skips or production deployment.
- **Delete this write-enabled workflow immediately after the formatting run.** Permanent read-only exact-HEAD checks must retest the four B123 Jest suites, B115/B116 integrity source tests, API/Web types and global `verify` on the new SHA. A formatter PASS is not a release qualification. Full API lint, privacy, B122 Mongo real-replica evidence, and the governed dependency audit remain separate required gates.

Do not claim all ten critical coverage jobs PASS on the new SHA until `verify` actually reports it. Release #353 remains **HOLD**; Account Export stays at format v1, Study Progress disabled by default. No main merge or production deployment from this carrier.
