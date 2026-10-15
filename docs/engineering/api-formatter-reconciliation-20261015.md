# API canonical formatter recovery — 2026-10-15

## Purpose and baseline

The repo-wide quality gate was stopping in `@losapuntes/api format:check` because of stale formatting across owner-account export, account closure and private study collections. The syntax error from the exported-owner test has already been independently integrated on `main` via B58; this block **does not reimplement that fix**.

A temporary diagnostic GitHub job checked out the candidate's exact SHA, installed the frozen workspace and ran the repo's pinned Prettier. It reported **25 TS files and 88 unified-diff hunks** under `apps/api/src`. Every patch hunk was compared against the exact source text and size before writing. Each file is committed separately. No business logic, data format, authorization, migration, dependency or suppression is deliberately modified.

The one-time diagnostic step was replaced by permanent, read-only acceptance:

- `pnpm --filter @losapuntes/api format:check`
- `pnpm --filter @losapuntes/api check:types`
- Jest exact-head targeted suites: account export service and assembler, study collections service, Mongo store mocked unit tests, and study collections feature guard

The original `pnpm check` and ten domain coverage jobs remain unchanged and authoritative. This does not constitute proof that a real Mongo replica acceptance suite has passed; no database is started.

## Parallel development and integration

The base is `main@4b006a672e29f7c2754c18079fe4f4209aa2b549`, with formatting limited to API. The next observed `main` advanced B60's review queue and session runner in Web, **with no overlaps** with this API patch.

Shared files with other open feature PRs must be consciously reconciled after their latest HEAD is read:

- **PR #316:** `study-collection.service.spec.ts`, `study-collection.service.ts`, `study-collection.store.ts`, `mongo-study-collection.store.ts`, `study-collections.controller.ts`. Preserve its private owner-authority functionality and re-run pinned Prettier after carrying in the final diff.
- **PR #331:** `account-export.controller.spec.ts`, `account-export-assembler.spec.ts`. Preserve the 30-section v1 negative/streaming tests and any B58 versioning invariants. Never replace tests with older snapshots.
- **PR #344 (Web formatter)** and #318 (private account export UX) have no shared files with this API formatter. This is not proof those PRs are otherwise merge-ready.

Do not use force updates, remove tests or skip CI because branches are apparently mergeable. The GitHub `main` exact SHA and the PR candidate SHA remain the source of truth.

## Security and release limitations

- Issue #133: the `node-forge@1.4.0` CVE-2026-85393 exception expired on 2026-10-15. Reassessment requires an upstream fix or explicit authorized, time-scoped risk decision, not an arbitrary renewed date.
- Issue #141: `braces@3.0.3` GHSA-vfj7-8cjw-p6xm is independent and must stay visible if a compatible patched Expo/Metro dependency graph has not been verified.
- This patch does **not** alter `pnpm-lock.yaml`, `package.json`, audit exceptions, or any dependency graph.

Browser/mobile/manual acceptance and deployment stay deferred until the rest of the product is ready, by design.
