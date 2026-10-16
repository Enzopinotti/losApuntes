# B85 — Processor fixture lint recovery against authoritative main

Date: 2026-10-16.

## Source provenance and parallel carriers

- Based directly on `main@070a10a0f32d404dc5a6be04014ba58a7eaba6b3`, the current B83 Mongo primary-clock lease and B82 expired-generation-completion fence merge.
- Main's `apps/api/src/data-lifecycle/domain/account-export-processor.spec.ts` Git blob at source was `ea776cfb07a2728aec6bdce3ed21b79de775aca2`, including newer B82 claim-completion and B83 Mongo lease guards. **No replacement with old #386/#387/#388/#390/#391 snapshots.**
- [PR #391](https://github.com/Enzopinotti/losApuntes/pull/391) from another agent measured **214 remaining lint errors, zero warnings** at its own SHA, with 192 in the processor spec as of its earlier source version; that PR has different, stacked base and is not yet reconciled with new main.

## Problem and fix

The account export processor's fixture publicly typed its mock holders as `jest.Mocked<AccountExportService>`, `jest.Mocked<AccountExportStore>`, `jest.Mocked<AccountExportAssembler>`, `jest.Mocked<AccountExportArtifactStorage>`, and `jest.Mocked<AccountExportOrphanCleanupStore>`. Those exposed types describe instance methods, so `expect(f.orphans.retry)` and 100+ other Jest matcher operations trigger `@typescript-eslint/unbound-method` despite values being independent Jest functions.

B85 retains the underlying Jest mocks as the fixture's test-facing properties, with the exact `AccountExportProcessor` production interfaces adapted **only at the constructor**. The same pattern is applied to the isolated crash/reclaim simulation inside the suite. Test callbacks, fixtures, S3 generation IDs, lease conditions and assertions are otherwise unchanged.

The one-time scoped formatter uses the repository's actual pnpm/Prettier lockfile, an exact-HEAD checkout and remote SHA lease, and can push only the processor spec formatting to its own B85 branch. **Delete the write-enabled workflow after formatting**. The permanent `B85 Processor Mock Contract` workflow is read-only and checks zero-warning ESLint, pinned Prettier, the entire processor Jest suite, API TypeScript and the existing B82/B83 Mongo source guards.

## Invariants

- Do not change the production processor, Mongo stores, clock source, owner epoch, claim completion CAS or artifact deletion semantics.
- B82 expired-generation CAS **fences before** any destructive S3 cleanup; B83 primary-clock lease validity and late-completion recovery remain authoritative.
- Keep owner-scoped pending/expired work, orphan cleanup fences, generation matching, receipt-late and crash-recovery tests. No test removals, skip markers or fake assertion counts.
- Do not disable ESLint, add `any`, relax audit thresholds, or extend the `node-forge` exception. Issue #353 release remains **HOLD**; production audit is an independent blocker.
- This B85 branch starts from **main**, not from the stacked quality carriers. After its exact-head tests pass, integrate semantically with #391's other fixture fixes and #388/#390's independent changes. Require a fresh global `verify` on the truly combined SHA before any main merge or release.
- No API/Mongo/Web startup, deployment, or browser acceptance in this block.
