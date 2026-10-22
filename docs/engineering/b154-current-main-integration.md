# B154 current-main integration evidence

**Date:** 22 October 2026 (ART)  
**Current-main base:** `fedab105d320526eb476813d004944461584e99a`  
**Source PR:** [#482](https://github.com/Enzopinotti/losApuntes/pull/482), source HEAD `9ffe866b3fa3ed11f9fc273f6cf61295be90177e`.

## Carrier scope

The carrier preserves all nine original B154 commits. Its single existing `resources.module.ts` change registers the overview service and controller. B155 (#483) also modifies that module, so a later carrier must preserve both the overview and batch-status registrations.

The six feature paths are limited to the private saved-overview service/controller, unit tests, the `ResourcesModule` registration, and the HTTP contract. The code reuses `authorizedSavedJoinStages` and `boundedSavedQuery`; there are no Web/Mobile, schema, dependency, lockfile, workflow, or protection changes.

## Local validation

On the current-main carrier:

- Focused Jest: 2 suites / 13 tests — PASS.
- `corepack pnpm --filter @losapuntes/api check:types` — PASS.
- `corepack pnpm --filter @losapuntes/api lint` — PASS with zero warnings.
- `corepack pnpm --filter @losapuntes/api format:check` — PASS.
- Prettier on the B154 HTTP contract — PASS.
- `corepack pnpm --filter @losapuntes/api build` — PASS.
- `git diff --check origin/main...HEAD` — PASS.
- No CI was manually run. No live Mongo acceptance was run; Jest verifies aggregation shape with mocks.

The read-only production audit `corepack pnpm audit --prod --audit-level high` fails on the unchanged current dependency baseline: 2 HIGH (`node-forge`, `braces`) and 3 MODERATE. This B154 carrier adds no dependencies. The source PR records the existing production audit and release hold; this integration does not waive either.
