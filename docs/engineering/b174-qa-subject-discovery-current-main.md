# B174 Q&A subject discovery current-main integration

## Identity and base

- Source PR: [#589](https://github.com/Enzopinotti/losApuntes/pull/589), source HEAD `4634bc636f23fc68ad58ce9d16e2d752782626b4`.
- Reconciled base: `origin/main@0b94da4e23a4a31161f04ed2c4ba95e0eb90c80c`, after #591, #592, #597 and #598.
- All 13 source commits were rebased in order. Two integration commits add the mobile input correction and this evidence; no source commit was squashed.

## Scope and review

The rebase completed without conflicts. The shared `test:web-social-qa-contract` remains in the canonical test chain. The final change uses existing Web and API routes; it adds no API, dependency, workflow, lockfile or protection change.

The 390 px Chromium review exposed an input inheriting a 220 px flex basis after the shared form changed to a column. The discovery input now keeps a 44 px minimum height on narrow screens.

## Local validation

- On the reconciled base, `corepack pnpm@9.15.9 test:web-social-qa-contract`, Web TypeScript, ESLint, `format:check`, targeted Prettier and production build — PASS. The build reports the existing Sass `@import` and large-chunk warnings; the manifest check reports `unavailable`.
- API `qa.service.spec.ts` — 34/34, including canonical academic filtering and deterministic cursor behavior.
- Chromium with local Web and a restricted API stub: malformed subject links issued no question-list request; subject search sent the selected UUID; copied URL contained only that UUID; opening a question preserved the subject filter. Desktop 1440 px and mobile 390 px had no horizontal overflow or JavaScript exceptions; the expected stubbed auth 401 was isolated. The mobile search field measured 44 px.
- Every intercepted API operation in the browser smoke was a GET. The auth response was stubbed, all other API requests were intercepted, and no real user or backend data was used.
- `git diff --check origin/main...HEAD` — PASS.

`prettier --check scripts/test-web-social-qa-contract.mjs` reports legacy formatting. The same check fails against the file on `origin/main`; this integration leaves its existing notification assertions and formatting intact.

No CI was invoked manually. The live API/Mongo smoke was not run because the Docker daemon did not become responsive during local runtime startup. No release or deployment is authorized by this evidence.
