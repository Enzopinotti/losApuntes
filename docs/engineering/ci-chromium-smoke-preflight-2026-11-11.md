# Verify CI — real Chromium smoke without apt mirror dependency

**Baseline:** `main@13b45569874703b293bb484482e0ecc96d383934`.
**Scope:** `.github/workflows/ci.yml`, a new real-browser preflight and tests.
**Release state:** no audit waiver or bypass; the independent production security gate still controls release.

## Root cause and observed evidence

[PR #778 verify run #43049769490](https://github.com/Enzopinotti/losApuntes/actions/runs/43049769490) completed the full Quality Gate and 10/10 domain coverages, but **Container runtime smoke FAIL** happened during **Install Chromium for browser smoke**. Playwright was called with `install --with-deps chromium`. That option attempted Ubuntu apt operations on an `ubuntu-22.04` runner. The apt mirrors were unreachable (runner log: `Temporary failure resolving 'azure.archive.ubuntu.com'`), and apt exited with code 100 while fetching optional system fonts.

The job never reached the Docker/Playwright browser acceptance, API lifecycle, database or object-storage probes. This was an **environment provisioning failure**, not an observed API/browser test failure.

## Hardened behavior

- Keep the Playwright-managed Chromium version defined by the repository's **frozen** `playwright@1.63.0` dependency. No system Chrome or unpinned browser substitution.
- Use `pnpm exec playwright install chromium` **without `--with-deps`**, avoiding an apt package install and the unrelated Ubuntu mirror dependency in the browser setup step. Retain three bounded download attempts with an error exit if all fail.
- Before Compose starts, **launch that actual Playwright Chromium** in headless mode, create a JS-enabled browser context and page, render a real DOM marker, execute a JavaScript sum, and assert results. If the GitHub runner lacks a required Linux shared library, the launch will fail and the smoke job will remain red. This is not a skip.
- Always close browser context and browser in `finally`, and emit a nonzero exit code for a failed direct preflight.
- Preserve Mongo kernel compatibility check, frozen dependencies, Docker Compose validation, pinned runtime container images, browser auth E2E, all API lifecycle smoke probes, runtime logs on failure and Compose teardown on every outcome.
- The required security production audit and all 10 critical coverage jobs are untouched and still gate release.

## Verification and acceptance

- `pnpm test:ci-browser-preflight-contract`: mock-only unit tests of launch/render/JS verification, error propagation, cross-cutting cleanup, and static workflow checks confirming no accidental `--with-deps`, bypass, production-audit alteration or removed browser/runtime probe.
- The actual Chromium preflight is **not** simulated in CI: `node scripts/ci/playwright-browser-preflight.mjs` must succeed on the GitHub runner after the binary installation.
- Exact-head full Quality Gate, 10 critical coverage jobs, audit and runtime smoke on this PR must be observed before claiming successful end-to-end acceptance.

This change targets a reproducible runner issue. It is **not** a fix for the 9 HIGH production advisories (Expo CLI `node-forge` and `zod`) still present in #778. No changes to dependency graphs or those advisories are made here. Do not merge if the product security policy requires every exact-head audit to be green.
