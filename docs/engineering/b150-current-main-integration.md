# B150 current-main integration evidence

**Date:** 22 October 2026 (ART)
**Current-main base:** `bdfcc0433af9faccf28bdb38ee4d2ee538be1010`
**Source PR:** [#477](https://github.com/Enzopinotti/losApuntes/pull/477), source HEAD `9192539c7a9e99b6936fc94e61898460b170809f`.

## Carrier scope

The carrier preserves all ten original B150 commits. The original `AppModule` mount applies cleanly to current `main`. The seven paths add a private relationship snapshot module, focused tests and its HTTP contract; there are no changes to existing Social workflows, Web/Mobile, schemas, dependencies, lockfile, workflows, or protections.

The service checks public-profile visibility through `ProfileService` before reading relationships, derives the viewer only from the session, and returns no external account IDs.

## Local validation

On the current-main carrier:

- Focused Jest: 2 suites / 12 tests — PASS.
- `corepack pnpm --filter @losapuntes/api check:types` — PASS.
- `corepack pnpm --filter @losapuntes/api lint` — PASS with zero warnings.
- `corepack pnpm --filter @losapuntes/api format:check` — PASS.
- Prettier on the B150 HTTP contract — PASS.
- `corepack pnpm --filter @losapuntes/api build` — PASS.
- `git diff --check origin/main...HEAD` — PASS.
- No CI was manually run. No live Mongo acceptance was run; focused tests use mocked profile and relationship reads.

The read-only production audit `corepack pnpm audit --prod --audit-level high` fails on the unchanged current dependency baseline: 2 HIGH (`node-forge`, `braces`) and 3 MODERATE. This B150 carrier adds no dependencies. The source PR records the existing production audit and release hold; this integration does not waive either.
