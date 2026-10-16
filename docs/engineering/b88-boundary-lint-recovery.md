# B88 — Recover strict API lint for owner export and Study boundaries

**Date:** 2026-10-16. **Stacked parent:** [#402](https://github.com/Enzopinotti/losApuntes/pull/402) at `3d70f44aa637d43eabd5657eb51bced63986d2c9` (B87 formatted B86 current-Mongo + B87 S3 SigV4). Another active carrier [#403](https://github.com/Enzopinotti/losApuntes/pull/403) overlaps B87 whole-API formatting; this PR **does not cherry-pick or merge #403**.

## Problems visible at the authoritative baseline

[Global verify #38926453041](https://github.com/Enzopinotti/losApuntes/actions/runs/38926453041) on this B87 parent has **10/10 critical coverage gates PASS** and full API/Web/Mobile `format:check` PASS, but API ESLint fails with **562 issues (437 errors, 125 warnings)** and production audit fails because the governed exception expired October 15, 2026. The affected baseline has different Mongo/processor test fixtures from older carriers; old aggregate lint counts must not be treated as direct comparisons.

## Semantic changes only

- **Nest rollout guards** keep `ExecutionContext` in the method contract but acknowledge its unused request-specific argument explicitly; private Study Collection and Progress flags still **fail closed**.
- **Study Progress plan** rejects the same remaining control characters U+0000–U+001F / U+007F via a plain codepoint check rather than ESLint-rejected regex, after original NFC trim/whitespace normalization; narrows `kind` and `startsAt` without redundant assertions. Regression tests reject bad title and notes and retain safe normalization.
- **Owner-only collection and progress readers** retain their 100-row page limits, owner-bound cursors, and corrupt-document rejection, while removing redundant final-row non-null assertions.
- **Account Export versioning Jest** keeps asynchronous contributor read, stable epoch recheck and commit-order promises through `Promise.resolve`, avoiding `async` without an `await`.
- **Account Export Service Jest** keeps all **42 test cases**, replaces `jest.Mocked<instance>` test-facing methods with generic `jest.Mock<ReturnType<...>, Parameters<...>>` functions, retaining strict request/claim/lease/complete argument types and adapting at the constructor boundary. Exactly **16** existing service reconstructions use their typed constructor adapters. Eight fixture callbacks still return real Promises and assert the exact version/owner/epoch; no production service change.

This code is not a wholesale copy of old PRs #388/#390/#391. All transformations were applied to the up-to-date B87 formatted file contents by exact-string predicates with explicit match counts. **No S3/processor/Mongo stores, lockfiles, CI limits, API contracts, permission checks or flags are modified.**

## Acceptance and integration

B88 read-only permanent CI runs: (1) ESLint zero-warning on eight touched API source/test files + API canonical format; (2) seven Jest domain suites + full API TypeScript + structural B83/B84/B85 clock/expiry guards; (3) **mandatory full API strict ESLint** with no ignores, waivers, or altered thresholds. The third may remain red until the two large Study Mongo integration suites and processor mocks are reconciled against this current main.

A one-time exact-head formatter may publish only these same eight API TS files to **its own branch** with an exact remote lease; that **write-enabled workflow must be deleted after formatting**, before recommending the PR as a carrier. Reverify final HEAD, including global `verify` and security audit.

**Release #353 is HOLD**, default export v1 and Study Progress OFF. No merge/deploy, no local Mongo/Web/API start, no aged audit exemption extension.

## Formatter evidence and removal

[One-time formatter run #38937041602](https://github.com/Enzopinotti/losApuntes/actions/runs/38937041602) **SUCCESS**. Checked out exact SHA `d300fd3a67f17a4c7978aa11cbc16e66925a2325`, installed frozen dependencies and ran locked Prettier on the eight B88 files. It published `faa72fccc9d00e5becfc0915aacd3050482b1a8c` with an exact-remote-head lease. Git comparison confirms **only one changed source file**, `account-export.service.spec.ts`; every other changed B88 source was already canonically formatted. The same workflow passed full API `format:check`.

The ephemeral `b88-once-format.yml` requested `contents: write` solely for that commit. This final candidate **deletes it**. Permanent `b88-strict-quality.yml` remains **read-only** and must be rerun on the new exact head, including strict full lint (no waiver), seven Jest suites, whole API TypeScript and B83–B85 source guards. Focused success cannot mean release approval.
