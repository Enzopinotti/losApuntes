# B129 — Study Progress Mongo: strict types, lint and real replica acceptance

**Base:** `main@1da1cff385cd9378460ef3cbbc5443b0c7f2aa2a` after B128. **Release #353 OPEN/HOLD**, `STUDY_PROGRESS_ENABLED=false` in production.

## Root cause and carefully scoped reconciliation

The current global API lint evidence from B128 reports **249 errors and 77 warnings**; `study-progress.mongo-int.spec.ts` alone accounts for **164 errors and all 77 warnings**, mostly Mongo query doubles returning dynamically typed values and unsafe extraction of response fields. Historical PR #437 has a fixture-level typed remediation. B129 copies **only** the corresponding file from that PR, not its stale neighboring production/fixture changes.

Before copying, the exact ordered list of **54 explicit `it()` test titles** was compared between B128 main and the historical patch: **identical**. The original suite also contains an `it.each` parameterized case; the real Jest result count must be validated in a Mongo replica so we do not mistake skipped acceptance for success.

This file owns safety-sensitive closure/cleanup acceptance. Beyond lint, B129 narrows its allowed URI to the literal loopback host/port `127.0.0.1:27017`, protocol `mongodb:`, path `/`, with only the `replicaSet=rs0` option, no embedded credentials or URI fragments. The `hello` topology still must report a valid writable primary and exclusively local replica members **before** permitting `dropDatabase` for the randomized scratch database. Production schema/guards are unchanged.

## Read-only regression

`.github/workflows/b129-study-progress-mongo-quality.yml` uses pinned Node24/pnpm lockfile and read-only checkout:
- full API typecheck, source Prettier and touched-file ESLint zero errors/warnings;
- Docker MongoDB 7.0 real single-node `rs0`, published only on numeric loopback, explicitly opted in via local-only `STUDY_PROGRESS_TEST_MONGO_URI`;
- unfiltered Jest test suite with strict `--passWithNoTests=false`, no skipped tests, no failed tests and at least 54 genuinely passed assertions (exact result count to document once run);
- immutable SHA and worktree checks; container is destroyed even after failure.

The `verify` global API lint and security audit still govern main. A focused lint PASS will not be misrepresented as full API lint passing. The expired 2026-10-15 `node-forge@1.4.0` CVE exception under #133 remains a release veto. #141, real S3/IAM and browser/restore remain independent requirements.

**Do not enable Study Progress, change export defaults or deploy.**
