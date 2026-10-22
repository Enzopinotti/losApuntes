# B130 — Export service/controller/versioning strict Jest quality

**Main base:** `826a020e9b93b32481ea62c4ad04a8c4bffdd84e` (B129). **Release #353 OPEN/HOLD**, `STUDY_PROGRESS_ENABLED=false`.

## Diagnosis

The last real global `verify #39187185100` completed 10/10 critical coverages but the Quality Gate failed with **85 API lint errors and zero warnings**. The highest concentration is the Account Export service suite (26 diagnostics) and controller suite (13), plus version compatibility tests (3). These are legitimate fixture typing/async assertions, not missing runtime code or an expired lockfile. They cannot be resolved by disabling ESLint rules, marking tests skipped or reverting owner-epoch/S3 security fences.

## Scoped changes

- Service fixture: replace Jest unbound method matchers with checks over **actual `.mock.calls`** that assert exact call count or `toContainEqual([...args])`. Replace unnecessary async `requestActive` mocks with real promise-returning implementations. Keep all existing owner-scoping, version rollback and post-upsert race cases.
- Controller: assert exact mock call records instead of detached method references, including response headers, preflight fences and abort-before-bytes checks. Three byte-stream fixtures remain async generators but now deliberately await resolved chunks; they exercise the same content and order.
- Versioning: the page contributor returns `Promise.resolve` or `Promise.reject` while preserving the rejection when pagination/owner scope differs; the epoch recheck and artifact commit mocks return resolved promises, preserving the observable ordering assertion.
- **No production code, model schemas, auth policy, audit exception, test manifest, lint configuration or coverage threshold changed.**

## Acceptance

The read-only PR-only `.github/workflows/b130-export-jest-quality.yml` runs Node24/pnpm frozen, ESLint `--max-warnings=0` on all three files, Prettier, **all tests** in the service, controller and versioning suites, and full API TypeScript. A second job runs the **actual complete API ESLint** with the unchanged rules, requiring the remaining count to be below 85 with 0 warnings. That measurement is not an ESLint waiver: if any errors remain, `verify` **must stay red** and release must not proceed.

The security audit still fails because the governed `node-forge@1.4.0` CVE exception expired 2026-10-15. Release issue #353 stays OPEN/HOLD, export defaults to v1 and Study Progress remains disabled until explicit approval and external S3/IAM/browser/restore acceptance.

## Verified B130 red/green results

The first [B130 run #39188705090](https://github.com/Enzopinotti/losApuntes/actions/runs/39188705090) identified **55 Prettier-only findings** across changed Jest expectations and promise mocks; this was not suppressed. A temporary read-only Node24 step generated canonical formatting on the runner for the exact current code and proved that the complete changed suites run. The two files whose formatting changed were committed with **the exact byte content produced by pinned Prettier**; the versioning file was already formatted. The diagnostic step was removed from the final workflow; it does not rewrite source during actual acceptance.

On the clean exact PR SHA `82d25bc6ad6fcd81c6ebfa151df0f36aae235259`:
- [B130 dedicated acceptance #39189017099](https://github.com/Enzopinotti/losApuntes/actions/runs/39189017099): **2/2 jobs PASS**. Three touched source files report **zero lint findings (and zero warnings)** and pass Prettier; full API TypeScript passes.
- **3/3 complete Jest suites PASS, 97/97 tests PASS**: service request/version compatibility, controller preflight and confidential-byte fencing, contributor pagination and owner-epoch checks.
- Whole API ESLint inventory, with the unchanged source glob and `--max-warnings=0`, reports **43 errors / 0 warnings** against the B129 baseline **85/0**: **42 errors eliminated**, with no excluded fixtures or rule disables. The global Quality Gate is still supposed to fail on these 43 errors.
- [B127 formatting and TypeScript #39189017230](https://github.com/Enzopinotti/losApuntes/actions/runs/39189017230) retains formatting/typecheck success; strict full API lint still fails. [B123 #39189017240](https://github.com/Enzopinotti/losApuntes/actions/runs/39189017240) and [B124 #39189017256](https://github.com/Enzopinotti/losApuntes/actions/runs/39189017256) preserve earlier exact-head Jest regression evidence.
- [Global verify #39189017191](https://github.com/Enzopinotti/losApuntes/actions/runs/39189017191) is the mandatory gate. It must be checked before merge for all 10 critical coverages and the remaining Quality Gate and dependency audit failures.

This documentation edit advances the PR commit SHA, so final exact-head acceptance must be rechecked. There is **no production launch GO**, no deployment, no security exception extension and no Study Progress enablement. B131 should resolve the remaining **43** errors across storage fixtures, Mongo mocks and boundary modules; separate dependency audit issues #133/#141 remain blocking.

## Cross-workflow regression found before merge: B89 ↔ B129 Mongo URI

The first otherwise green B130 exact-head [B122 run #39189172120](https://github.com/Enzopinotti/losApuntes/actions/runs/39189172120) **FAILED 5/5 real B94 Mongo acceptance cases** at B61 fixture setup, before their bodies executed. This was a pre-existing integration incompatibility from B129, not an export runtime change:

- Security guard `scripts/testing/b89-local-mongo-uri.mjs` first verifies real loopback DNS and pins an IP address. It then **appends `directConnection=true`** to prevent the Mongo driver from being redirected to a remotely advertised replica host.
- B129's test-only `study-progress.mongo-int.spec.ts` required the URI to have **exactly one query option** `replicaSet=rs0`, rejecting B89's safe, stronger, two-option URI.
- B130 retains the original **numeric loopback host `127.0.0.1:27017`, `rs0` requirement, no credentials/path/hash and verified local writable PRIMARY**; its option allowlist now permits either `replicaSet=rs0` only (standalone B129) or `replicaSet=rs0&directConnection=true` (B89/B122), with **no other option names or values accepted**. It does not relax hostname rules or permit remote Mongo.

**Red-green test evidence on the source commit `0a87bfa45669d25d892a656d6d952448db499e80`:**
- [B122 real Mongo/S3 #39189413723](https://github.com/Enzopinotti/losApuntes/actions/runs/39189413723): **SUCCESS, all 5 named B86/B90/B93 cases PASS**, S3 HTTP transport mocked, Mongo 7 `rs0` genuine.
- [B129 Study Progress real Mongo #39189413699](https://github.com/Enzopinotti/losApuntes/actions/runs/39189413699): **2/2 jobs SUCCESS, 56/56 actual Mongo cases, 0 skips**, touched-file strict lint, Prettier and full API TypeScript green.
- [B130 strict Jest/ESLint #39189413649](https://github.com/Enzopinotti/losApuntes/actions/runs/39189413649): **2/2 jobs SUCCESS, 97/97 Jest cases, 43/0 global remaining ESLint diagnostics**.

This fix was discovered by executing workflows from separate previous blocks together rather than assuming each passing in isolation meant their composition was safe. It is a test infrastructure safety correction; **no external Mongo provider, production credentials, release flag, or account-data mutation was introduced**.

The documentation update advances the Git SHA; repeat exact-head checks before merge. The release remains **#353 OPEN/HOLD** and the dependency security audit is still a veto.
