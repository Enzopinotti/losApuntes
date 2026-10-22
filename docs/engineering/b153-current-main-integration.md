# B153 current-main integration evidence

**Date:** 22 October 2026 (ART)
**Current-main base:** `bdfcc0433af9faccf28bdb38ee4d2ee538be1010`
**Source PR:** [#481](https://github.com/Enzopinotti/losApuntes/pull/481), source HEAD `f3de37aa4ec702b9f5721dc58d8f148f5ea45b11`.

## Carrier scope

The carrier preserves all nineteen original B153 commits. Its changes add a full-permutation reorder operation guarded by owner, expected revision, original resource array, and the existing active-owner transaction. The original `study-collections.module.ts` registration adds the order service/controller. PR #478 (B151) also touches that module, so a later carrier must preserve both registrations.

The eleven paths are limited to Study Collections API/Mongo code, focused tests and the HTTP contract. There are no Web/Mobile, schema, dependency, lockfile, workflow, or protection changes.

## Local validation

On the current-main carrier:

- Focused Jest: 4 suites / 64 tests — PASS, including service, legacy service regression, HTTP controller and transaction-store tests.
- `corepack pnpm --filter @losapuntes/api check:types` — PASS.
- `corepack pnpm --filter @losapuntes/api lint` — PASS with zero warnings.
- `corepack pnpm --filter @losapuntes/api format:check` — PASS.
- Prettier on the B153 HTTP contract — PASS.
- `corepack pnpm --filter @losapuntes/api build` — PASS.
- `git diff --check origin/main...HEAD` — PASS.
- No CI was manually run. No live Mongo replica-set acceptance was run; transaction tests use local test doubles.

The read-only production audit `corepack pnpm audit --prod --audit-level high` fails on the unchanged current dependency baseline: 2 HIGH (`node-forge`, `braces`) and 3 MODERATE. This B153 carrier adds no dependencies. The source PR records the existing production audit and release hold; this integration does not waive either.
