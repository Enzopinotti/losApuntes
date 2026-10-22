# B126 — Owner-scoped academic feed and Files/Resources function coverage

**Date:** 2026-10-18. **Stacked base:** [B125 PR #447](https://github.com/Enzopinotti/losApuntes/pull/447), exact `642bd99925178d5219f1bbe96b1e2017b370ef96`, based on `main@acc9f2084268a3269c2348b59d04e84b787e49cd` (B124). This block makes **no production changes** and does not copy Q91's legacy formatted source snapshots.

## Observed baseline

[B125 exact-head CI #39156602286](https://github.com/Enzopinotti/losApuntes/actions/runs/39156602286) passed both focused jobs and restored Files/Resources function coverage to **142/149 = 95.30%** (95% required), with **1434 Jest tests passing, 69 opt-in tests skipped**. All ten critical coverage jobs passed in its global `verify`; however, global Quality Gate and dependency audit remained red. The remaining uncovered functions in that report were six defensive S3 cancellation error handlers and `ResourceService.getFeedCandidates` at `resources/domain/resource.service.ts:370`.

## B126 domain regression

Add a real Jest test to `resource.service.spec.ts` covering `getFeedCandidates`:

- Pass through the **authenticated viewerUserId** to `listFeedCandidates` along with exact subject and author allowlists, anchor time and bounded requested page size.
- Return only the ResourceStore-authorized candidates. When a different viewer receives no candidates, **return an empty page** without probing file access, attribution or cross-user data for fallback results.
- Assert the store calls carry the precise per-viewer arguments. The service is a facade and does not implement its own SQL/Mongo filtering, so this test intentionally does **not** claim it independently proves the store's row-level authorization. That must be checked in the store's separate tests.

This covers a previously uncovered real function in production without weakening security, deleting code, creating fake coverage files or relaxing the 95% threshold. Expected improvement is **143/149 = 95.97%** if no other coverage source changes; CI must confirm the measured value.

## Exact-head contract

Permanent read-only `b126-feed-candidate-coverage.yml` enforces frozen Node24/pnpm, exact SHA, zero-warning ESLint and Prettier of the changed spec, the entire Resource Service Jest suite, full API TypeScript and the unmodified `jest.files-resources-coverage.cjs` threshold across the full Files/Resources selection.

**Release #353 HOLD.** No main merge, production S3/Mongo changes, security exceptions, coverage threshold edits, service startup or deployment. Any further fixes remain separate until global lint and dependency audit are approved.
