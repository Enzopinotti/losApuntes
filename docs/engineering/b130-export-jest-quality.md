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
