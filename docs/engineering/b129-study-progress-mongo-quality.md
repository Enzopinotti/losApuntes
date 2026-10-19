# B129 — Study Progress Mongo: strict lint restored, 56 real tests

**Base:** `main@1da1cff385cd9378460ef3cbbc5443b0c7f2aa2a` after B128. **Release:** #353 OPEN/HOLD, `STUDY_PROGRESS_ENABLED=false` in production.

## Diagnosis and a revised, safer strategy

The final B128 global `verify` had **249 strict API ESLint errors and 77 warnings**. The dominant `apps/api/src/study-progress/mongo/study-progress.mongo-int.spec.ts` accounted for **164 errors and all 77 warnings**. The underlying causes were unchecked Mongoose `Document.id` leaking `any` into dozens of account-owner tests, unsafe spreads of dynamic `hello` topology fields, and unnecessary `async`/non-typed test doubles.

An earlier attempt copied a historical fixture from PR #437 because all **54 explicit scenario titles and order matched**. This was **rejected** after its actual Node24 run: it retained a large deprecated Prettier style and produced 2,640 lint observations. The historical snapshot was abandoned before integration. The final implementation starts with the **authoritative B128 main fixture**, preserves every original Jest scenario and includes only minimal typed boundary fixes.

## Implemented security and lint fixes

- The fixture's `owner()` checks `row.id` as `unknown`, requires a nonempty string and returns `Promise<string>`; no unsafe Mongo value can be passed as a caller-supplied owner ID.
- The `hello` response is received as `unknown` and checked before reading replica members, which are handled as `unknown[]` rather than unsafe `any[]`.
- Destructive scratch database cleanup only accepts a literal numeric-loopback `mongodb://127.0.0.1:27017/?replicaSet=rs0` URI with no credentials or other options. A local writable PRIMARY and exclusively local reported members must be verified **before** a UUID-named temporary DB can be dropped, and only on a connected MongoDB instance.
- All test-only account export mocks preserve **actual Promise return/rejection** using `Promise.resolve` or `Promise.reject`, removing redundant async methods. No production behavior or test expectation is weakened.
- Mongoose connection state compares against `ConnectionStates.connected`; runtime Jest asymmetric `Date` matchers are held as `unknown` rather than leaking `any`; unused non-null assertions and redundant interface casts removed; simulated S3 `fetch` URLs are parsed from an actual URL/string/Request rather than `String(object)`.
- The tests still verify owner isolation, revision fences, account closure, export portability, recovery, partial S3 failures and orphan cleanup. No `eslint-disable`, `any` casts, skipped tests, mock provider changes or relaxed coverage/security thresholds.

## Real red/green acceptance

The first real Mongo acceptance from the revised main-based fixture passed **56/56 tests** on MongoDB 7 single-node rs0. The first strict lint run surfaced **22 remaining errors and 0 warnings**. After typed/mock fixes it reported only **five Prettier violations**; those five canonical formatting changes were applied.

On [B129 run #39186990111](https://github.com/Enzopinotti/losApuntes/actions/runs/39186990111), current branch validation had **2/2 jobs SUCCESS**:
- touched-file ESLint with `--max-warnings=0`, Prettier and full API TypeScript: **PASS**;
- **56/56 Jest cases PASS**, 0 skipped/failed, with real Docker MongoDB 7 `rs0` on 127.0.0.1:27017, verified PRIMARY, disposable scratch database cleanup and container disposal: **PASS**.

[Global `verify` run #39186990123](https://github.com/Enzopinotti/losApuntes/actions/runs/39186990123) measured **249 -> 85 remaining API errors (−164)** and **77 -> 0 warnings** with original strict rules. All **10/10 critical coverage groups SUCCESS**. Full Quality Gate remains **FAIL** on the 85 *other* errors, and Production dependency audit remains **FAIL** because the governed `node-forge@1.4.0` CVE-2026-85393 exception expired on 2026-10-15. Runtime smoke skipped; no production GO.

A final workflow change now requires **exactly 56 Jest cases PASS** with no pending/failed cases. It and this document change the head SHA; use subsequent exact-head evidence before merging.

## Next owners and release vetoes

Review the remaining 85 errors across `account-export.service.spec.ts`, `account-export.controller.spec.ts`, S3/Study fixture and boundary modules in small typed follow-up blocks. Do not blanket-disable rules or merge old overlapping PRs. The expired security exception #133, separate #141 dependency finding, and external S3/IAM, browser and restore evidence still block release.

**#353 stays OPEN/HOLD**, `STUDY_PROGRESS_ENABLED=false` productivo, Account Export v1 default, no deployment.
