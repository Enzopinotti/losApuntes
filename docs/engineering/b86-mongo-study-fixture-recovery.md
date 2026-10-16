# B86 — Recover API type contract on authoritative Mongo/S3 main

**Date:** 2026-10-16. **Start SHA:** `main@7ef5f4fcdb4f0213888f1671238d770c513da2b9` after B86 fault-injection acceptance. This main includes the B82 expired-claim fence, B83 primary-server-clock lease, B84 cleanup queue timing, B85 artifact-expiry authority, and B86 tests. No production file is modified.

## Root-cause evidence

[B85 verify #38913820290](https://github.com/Enzopinotti/losApuntes/actions/runs/38913820290) and its focal TypeScript job fail on four diagnostic locations from **two test fixture files**, unrelated to the B85 processor's 86 green tests:

1. `mongo-account-export.store.spec.ts`: `updateOne` mock functions declared as `jest.fn(() => ...)` inferred zero parameters; their `mock.calls[0][1]` and `for (const [filter] of mock.calls)` assertions are rejected as out-of-range tuples (TS2493), cascading to TS2352.
2. `study-progress-export.reader.spec.ts`: the intentionally corrupted persisted Mongo row cannot pass a fixture parameter inferred from only a valid `stored()` return type (TS2353); production is correctly responsible for rejecting the corrupted row.

## B86 corrections

- Define two **typed Jest argument tuples** for `jobs.updateOne` and `orphanCleanup.updateOne` as `[filter: unknown, update: unknown, options?: unknown]`. The mocked result stays opaque (`unknown`) because actual store wiring already receives these as test-only Mongoose fakes. No discarded parameters, explicit `any`, or weaker Mongo claims.
- Before reading an orphan queue's `$setOnInsert` dates, assert it was called exactly once. All original `nextAttemptAt` and `verificationUntil` ordering conditions remain.
- The private Study Progress fixture accepts `unknown[]`, modeling a real Mongo read boundary where invalid persisted documents are possible. The tested reader still rejects the extra `unknownField`; the public export schema and runtime validation are unchanged.

## Canonical acceptance

The read-only [B86 workflow](../.github/workflows/b86-mongo-study-type-recovery.yml) checks exact SHA / frozen pnpm / Node 24 and runs **full API TypeScript**, both original Jest suites and the B83–B85 Mongo primary-clock/expiry source guards. A separate mandatory job runs **strict ESLint and pinned Prettier** on the same two files; this can remain red until their formatting is reconciled, and is never silently skipped.

The wider consolidation remains work in progress. Historical carriers [#386](https://github.com/Enzopinotti/losApuntes/pull/386), [#388](https://github.com/Enzopinotti/losApuntes/pull/388), [#390](https://github.com/Enzopinotti/losApuntes/pull/390), [#391](https://github.com/Enzopinotti/losApuntes/pull/391), and processor choices [#393](https://github.com/Enzopinotti/losApuntes/pull/393)/[#396](https://github.com/Enzopinotti/losApuntes/pull/396) have **different parents and overlap**. Never wholesale copy an obsolete Mongo processor or S3 store. Reconcile each component against latest main, then require `verify` **on exact combined HEAD**.

**Release issue #353 remains HOLD**; no conditional waiver of `node-forge`/other security debt, no disabled lint/types/coverage, no service startup or deploy.
