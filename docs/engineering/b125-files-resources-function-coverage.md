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

## Observed coverage and temporary formatter retirement

The initial focused [B125 run #39156174945](https://github.com/Enzopinotti/losApuntes/actions/runs/39156174945) exercised **126 passing coverage suites and 1,434 passing tests**, with 69 intentionally skipped test cases in two opt-in Mongo suites. Full Files/Resources function coverage increased from **140/149 = 93.95%** to **142/149 = 95.30%**, over the unchanged required **95%** threshold; 7 S3 and 1 Resources callbacks had been untested originally, now two additional S3 callbacks run. Its scoped format job failed independently because the new source needed pinned Prettier.

The one-time branch-scoped formatter [run #39156381683](https://github.com/Enzopinotti/losApuntes/actions/runs/39156381683) used frozen Node24/pnpm and reformatted **only** `apps/api/src/files/storage/s3-object-storage.spec.ts` in exact-lease commit `d1c0dffdd6b4e4f5f040b4c9aa30aa45647579f8`. This subsequent candidate commit **removes its temporary `contents:write` workflow**, leaving only the permanent read-only B125 coverage workflow. Retest the resulting exact HEAD before declaring this PR focused-green. Prior coverage percentages are observed from the preceding test commit, not a substitute for final-head evidence.

The B123 Jest gate failed on earlier unformatted heads *only at the Prettier step*; the four suites executed **165/165 PASS**. The canonical source commit fixes that formatting mismatch. The whole-repository `verify` and dependency audit may remain red for unrelated legacy issues; their failure must be reported rather than waived.
