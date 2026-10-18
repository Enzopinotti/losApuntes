# B125 — Files/Resources real function coverage, no threshold waiver

**Date:** 2026-10-18. **Base:** `main@acc9f2084268a3269c2348b59d04e84b787e49cd` (B124). This carrier is independent from [Q91 #445](https://github.com/Enzopinotti/losApuntes/pull/445) and does not copy its full-format API/Web source snapshots. B124 has already merged the three API test type corrections, so this branch does not duplicate them.

## Grounded failure and scope

[Q91 global verify #39153109849](https://github.com/Enzopinotti/losApuntes/actions/runs/39153109849) found **126 Files/Resources suites passed** and **1,431 tests passed** (two opt-in Mongo suites/69 tests skipped). However, the Jest global function coverage was **93.95% against a mandatory 95% minimum**, which correctly caused the gate to fail. API lint and the governed security audit are independent and remain mandatory.

B125 adds **security-focused S3 tests** to the current `s3-object-storage.spec.ts` (no production changes):

- Protects generated RFC 5987 `filename*=` dispositions: apostrophes, brackets and asterisks must be percent-encoded, while ASCII fallback sanitizes CR/LF before constructing the signed response metadata. Confirms the resulting download URL is still signed.
- Rejects malformed internal and public storage endpoint strings *before* signing any URL; preserves the separate existing rejection of non-root, credentialed and non-HTTP endpoints.
- Further functional scenarios may be added based on observed uncovered function names, not arbitrary tests to inflate percentages.

The new **read-only exact-HEAD** workflow runs two independent jobs: (1) strict S3 spec ESLint, Prettier, full Jest and API TypeScript; (2) **the unmodified `jest.files-resources-coverage.cjs` full 128-suite coverage gate**. The latter preserves the original Jest failure exit status while printing the actual uncovered function names and aggregate counts from coverage-final.json. It does **not lower threshold, exclude source files, or skip coverage tests**. In the final candidate, the threshold must be at least **95% on exact SHA**, or the PR stays DRAFT with explicit failure.

Production source S3 adapters, Mongo stores, permissions, source glob, release flags and dependencies are untouched. Release #353 **HOLD**, default Account Export format v1 and Study Progress OFF. No main merge, deployment or service startup.
