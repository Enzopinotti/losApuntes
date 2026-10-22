# B155 current-main integration evidence

**Date:** 22 October 2026 (ART)
**Current-main base:** `bdfcc0433af9faccf28bdb38ee4d2ee538be1010`
**Source PR:** [#483](https://github.com/Enzopinotti/losApuntes/pull/483), source HEAD `dea5d4479ab703351eb742a2c739c36e71a26bff`.

## Carrier scope

The carrier preserves all eleven original B155 commits. Separate commits format and clarify the HTTP contract, fix case-insensitive UUID matching, and record this evidence. The module registration applies to the current Resources module; the source PR #482 (B154) also touches `resources.module.ts`, so a later carrier must preserve both additions.

The seven source paths remain limited to Resources API code and its HTTP contract. There are no Web/Mobile, schema, dependency, lockfile, workflow, or protection changes. Existing `authorizedSavedJoinStages` is reused for current moderation and visibility checks.

## Local validation

On the current-main carrier after the UUID normalization fix:

- Focused Jest: 2 suites / 13 tests — PASS, including case-variant lookup and duplicate rejection.
- `corepack pnpm --filter @losapuntes/api check:types` — PASS.
- `corepack pnpm --filter @losapuntes/api lint` — PASS with zero warnings.
- `corepack pnpm --filter @losapuntes/api format:check` — PASS.
- Prettier on the B155 HTTP contract — PASS.
- `corepack pnpm --filter @losapuntes/api build` — PASS.
- `git diff --check origin/main...HEAD` — PASS.
- No CI was manually run. No live Mongo acceptance was run; Jest validates the owner-scoped pipeline with mocks.

The read-only production audit `corepack pnpm audit --prod --audit-level high` fails on the unchanged current dependency baseline: 2 HIGH (`node-forge`, `braces`) and 3 MODERATE. This B155 carrier adds no dependencies. The source PR records the existing production audit and release hold; this integration does not waive either.
