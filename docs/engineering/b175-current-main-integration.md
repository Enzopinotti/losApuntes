# B175 current-main integration evidence

**Date:** 22 October 2026 (ART)
**Current-main base:** `25fcd377596e095ca49eaf7a57a914a586d243f7` (merge commit for #597).
**Source PR:** [#594](https://github.com/Enzopinotti/losApuntes/pull/594), published HEAD `6cfbaf7681fcef3b889a7cd877b0dfeef756a788`.

## Carrier scope

The carrier preserves all 11 B175 source commits in order, rebased onto the current main that includes B163. One additional atomic commit adds browser acceptance coverage and its package command; a separate documentation commit records this integration. The resulting carrier has 13 commits ahead of the stated base and changes 10 files.

The block adds an authenticated save action to public search results. It calls the existing `PUT /resources/:id/save`, reports success only for `{ saved: true }`, treats ambiguous outcomes as unknown and does not automatically retry. It changes no API, database, dependency, lockfile, workflow or protection.

## Local validation

On the carrier rebased onto `main@25fcd377`:

- `corepack pnpm@9.15.9 test:web-search-contract` — PASS.
- `corepack pnpm@9.15.9 test:web-search-save-browser` — PASS in real local Chromium with the API intercepted. It covers guest gating, authenticated success, duplicate-click fencing, an ambiguous response without automatic retry and a 403 response. It does not claim live API/Mongo acceptance.
- Web `check:types`, `lint` and production `build` — PASS. The build retains the existing Sass `@import` deprecation and >500 kB chunk warnings; the release manifest reports `unavailable`.
- `corepack pnpm@9.15.9 -r --if-present format:check` — PASS for API, Web and Mobile.
- Prettier on the added browser script and `package.json` — PASS.
- `git diff --check origin/main...HEAD` — PASS.
- No CI was manually run. Push/open events may start GitHub-configured automation.

## Acceptance boundary

The browser test uses isolated API responses and synthetic authentication; no real user or stored data is involved. A separate backend acceptance remains useful for confirming that a successful save appears in Guardados and that a real authorization revocation is reflected in the UI. The existing Resources endpoint and its authorization remain authoritative. This integration evidence does not claim deployment approval or resolve the repository-wide dependency audit.
