# B131 — API strict ESLint closeout, no waivers

**Based on:** `main@ce653c90528f2d7480ba06b146f97f70b13571ae` (B130). **Release #353 OPEN/HOLD**, `STUDY_PROGRESS_ENABLED=false`, Account Export default v1.

## Diagnosis

B130 [global verify #39189549143](https://github.com/Enzopinotti/losApuntes/actions/runs/39189549143) passed 10/10 critical coverage gates but still reported **43 strict API lint errors and 0 warnings**. The audited dependency exception remains expired. The 43 are distributed across 16 source/test files. The largest single cohort is 12 unsafe/no-await generator fixtures used to verify private S3 artifact integrity; next is 8 Mongo export store mock issues and four orphan queue call-record typing issues.

## Repair strategy

This block changes source and test files **without changing the API surface or weakening security conditions**:

- Jest test doubles that emulate S3 byte streams now genuinely await their yielded bytes, and failing streams yield an awaited rejecting promise so they remain exactly as fail-closed as before.
- Account-export and Study Collection Mongo test mocks retain their arguments and use typed call histories/unknown matchers rather than propagating Jest `any`.
- S3 UploadId, part ETag, request-header and Study Session control-character filters now use **explicit character code comparisons**, retaining the same forbidden code point sets without ESLint `no-control-regex`.
- For S3 multipart snapshot failure, a non-Error thrown value is converted to an Error preserving the original as `cause`, maintaining rejecting semantics.
- Feature guards retain fail-closed flag behavior and satisfy `CanActivate` while omitting unused request-context arguments.
- Study progress pagination and plan validators retain the same narrowed runtime types without unnecessary non-null/type assertions. Download's legacy third argument remains supported for call compatibility; the Mongo primary remains authoritative for expiry.

**No `eslint-disable`**, no per-file ignore, no reduced lint rule, no dependency changes, no security flag changes, no test removals or bypasses. New tests must actually run (no opt-in integration skips counted as passes).

## Acceptance protocol

The immutable, read-only `.github/workflows/b131-api-lint-closeout.yml` workflow runs pinned Node24 with frozen pnpm, **full API ESLint unmodified with zero permitted errors/warnings**, full API and Web/Mobile canonical formatting and API typecheck, then all related Jest suites and B115/B116 S3 source guards. Existing workflows B121/B122/B123/B124/B129/B130 and global `verify` are independently triggered by the relevant PR changes. A regression is a failure; do not merge unless the actual exact-head evidence is green on all appropriate gates.

Even if full lint is fixed, the governance control `Production dependency audit` still **FAILS** because the `node-forge@1.4.0` CVE-2026-85393 exception expired 2026-10-15, issue #133 (see also #141). This is a separate release veto. B131 must not extend the exception or claim S3 remote/browser/restore acceptance.

**No release GO, no deployment, #353 OPEN/HOLD.**
