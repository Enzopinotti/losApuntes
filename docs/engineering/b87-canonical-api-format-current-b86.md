# B87 — Canonical API formatting after B86 cross-agent reconciliation

Date: 2026-10-16. **Parent candidate:** [PR #399](https://github.com/Enzopinotti/losApuntes/pull/399) at exact `f78ad9710db287728c846d9ceff5711d72a64441`, based on the merged B87/SigV4 `main@ce9385456904fcd38f5e5a81509013d1a46c17bd`.

## Why this needs a separate carrier

B86's [focused run #38920537302](https://github.com/Enzopinotti/losApuntes/actions/runs/38920537302) passed 3/3 independent jobs: whole API TypeScript, 5 Jest suites with **88 tests**, source guards B83/B84/B85, strict scoped ESLint/Prettier, and Web formatting/lint/typecheck. Its [global verify #38920537363](https://github.com/Enzopinotti/losApuntes/actions/runs/38920537363) passed **10/10 domain critical coverage jobs**, but its global Quality Gate **FAILED** because **47 API files** remain in pre-Prettier format; dependency security audit also **FAILED**. The runner skipped runtime smoke. The global SHA is **not green**.

Historical [PR #377](https://github.com/Enzopinotti/losApuntes/pull/377), [#386](https://github.com/Enzopinotti/losApuntes/pull/386) and [#387](https://github.com/Enzopinotti/losApuntes/pull/387) contain stale source snapshots; reusing their fully formatted files would overwrite newer server-clock, S3 multipart, claim/CAS and recovery implementations. We must format **the current B86 tree itself** with the locked package version and cannot mix formatting with production-logic changes.

## Format-only execution and safety

The one-time workflow `B87 one-time canonical API format on B86`:
1. Checks out the **exact** PR HEAD; verifies expected remote ref and clean worktree; restricts execution to **this branch**, not `main`, and to same-repository PRs.
2. Installs Node pinned via `.nvmrc` (24) and pnpm from lockfile using `--frozen-lockfile`.
3. Runs `pnpm --filter @losapuntes/api format` against current `apps/api/src/**/*.ts` and `apps/api/test/**/*.ts` and verifies the diff contains **only those TypeScript files** (no workflows, dependencies, lockfiles, JS, Web or Mobile).
4. Makes a single real formatting commit on the **own branch** with `--force-with-lease` bound to the verified original SHA, so it cannot overwrite concurrent agent changes.
5. Checks pinned `format:check` and entire API `check:types` on the formatted commit.

**Remove the write-enabled temporary workflow from this PR immediately after it succeeds.** Keep permanent CI read-only, rerun global `verify` **at the new exact SHA**, and separately check 10/10 coverages, lint API, API/Web types, Mongo/S3 guards and security audit. Format success is not a release gate by itself.

No `eslint-disable`, `any` sweep, skipped tests, changed API contracts, `ours/theirs` merge strategy, expired audit waiver renewal or deploy. Preserve [#399](https://github.com/Enzopinotti/losApuntes/pull/399)'s typed untrusted Mongo fixtures, owner export epoch, B81 CAS, reviewed v3 contributor inventory, B82 React hook dependencies and B87 S3 SigV4. Release [#353](https://github.com/Enzopinotti/losApuntes/issues/353) stays **HOLD**. No local runtime, API/Mongo/Web launch or deployment.

## Result — exact-tree canonical formatting

[One-time formatter run #38925693678](https://github.com/Enzopinotti/losApuntes/actions/runs/38925693678): **SUCCESS**, after exact HEAD, remote branch, frozen install and source-only checks; generated a **single commit** `e6f16f1e46404e0ffb1dfec61c4fff7e87115850`. Git comparison confirmed **exactly 47 modified files**, all `apps/api/(src|test)/**/*.ts`, zero other paths. The run checked **API format:check SUCCESS** and **API TypeScript SUCCESS** on the resulting tree. No production logic was intentionally edited by this formatting-only command.

**Write-permission lifecycle closed:** The temporary `b87-one-time-canonical-api-formatter.yml` workflow is **deleted in the same commit as this evidence**; it is not part of the final candidate. A new permanent `b87-api-canonical-quality-contract.yml` is **read-only** and runs three independent exact-HEAD jobs: pinned API/Web format + types + Web lint, five critical Jest suites + B83/B84/B85 clock/expiry guards, and whole-API strict ESLint as a **mandatory** gate. The last job may remain red until its remaining type-safe lint fixes are applied; never hide that result.

Next, recertify the entire global `verify` and `security:audit` on this **new** final SHA. Keep release #353 HOLD and avoid merging stale source snapshots from other carriers.
