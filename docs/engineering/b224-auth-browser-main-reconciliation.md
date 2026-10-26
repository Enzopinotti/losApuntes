# B224 — Reconcile Auth browser smoke onto current main

**Base:** `main@dfaca9b6fb86f4a5f11bd1bfaa92d61c57c403c1`, 2026-10-25.  
**Origin:** historic [PR #712 / B194](https://github.com/Enzopinotti/losApuntes/pull/712).  
**Status:** Draft / release HOLD; no deploy or feature changes.

## Observed failure on canonical CI

Global [verify #40254067733](https://github.com/Enzopinotti/losApuntes/actions/runs/40254067733) passed Quality Gate and all ten critical coverage jobs but failed its **Container runtime smoke** inside the Auth Playwright scenario: `getByLabel('Confirmar contraseña')` matches both the input and the "Mostrar confirmar contraseña" visibility toggle, causing a strict locator violation **before the intended smoke assertions finish**. The same existing browser test also referenced a former Dashboard H1 and did not exercise password reveal keyboard affordances.

Main still has the pre-fix script Git blob `8599d77670b14d4d9c571f9f57fd70a407bab643`. The current Dashboard H1 remains `¿Qué querés hacer hoy?`, consistent with the updated tests. No other open parallel agent PR modifies these three script paths except source #712.

## Functional regression consolidation

Reconcile only three code/test blobs **unchanged** from #712 into a current-main branch:

1. `scripts/auth-browser-e2e.mjs`: all login, signup and account recovery password input selectors use exact accessible names instead of matching visibility buttons; verify reveal/reconceal and Tab order. Assert the live Dashboard heading after authenticated navigation, while keeping session-cookie, status, logout and privacy boundary checks.
2. `scripts/test-auth-browser-password-locators.test.mjs`: reject ambiguous selector regressions and verify keyboard + visibility semantics and input type transitions.
3. `scripts/test-auth-dashboard-route-contract.test.mjs`: pin real Dashboard semantic H1, authenticated URL and secure-cookie boundary.

No Auth API, production password UI, route component, stored credentials, database, cookie implementation or dependency was changed to satisfy the smoke. A dedicated exact-head Node24 workflow tests the source contract. The **canonical global Container runtime smoke** must separately execute a real browser against API/Mongo and pass on the combined branch before any merge.

## Release and cleanup

The earlier [#712](https://github.com/Enzopinotti/losApuntes/pull/712) on the stale main already had [exact-head Container runtime smoke SUCCESS](https://github.com/Enzopinotti/losApuntes/actions/runs/40203197382). B224 demands the same proof **on the current main and current code** before superseding its historical carrier.

Global `pnpm audit --prod --audit-level high` is still mandatory and fails on Expo transitive `node-forge` (#133) and `zod` (#705); **do not waive or override** them. [Release #353](https://github.com/Enzopinotti/losApuntes/issues/353) stays HOLD, and `STUDY_PROGRESS_ENABLED=false`. A passing browser smoke is necessary but does not authorize signing or deployment.

Once B224 focused and full browser tests pass and blob equivalence is verified, close source #712 as **superseded, NOT merged**, preserving branch and audit trail.
