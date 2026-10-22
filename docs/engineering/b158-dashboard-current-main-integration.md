# B158 Dashboard current-main integration evidence

## Identity and base

- Source PR: [#578](https://github.com/Enzopinotti/losApuntes/pull/578), Draft.
- Published source HEAD: `0d9b43f98d7fce283c3bbdc72b96f2892c8d0b58`.
- Reconciled base: `origin/main@568e932fdfa8c36a0cf9524f03ff92ee6f47216b` (after B183/#591).
- The nine functional commits remain in order; this evidence is a separate commit. The two source commits that changed a workflow are excluded.

## Integration notes

Rebase produced one conflict in the root test chain. The resolution keeps the current `main` checks, including `test:web-home-momentary-hide-b183`, and adds `test:web-dashboard-b158` to both the root test chain and script declarations. Visual review also caught that the shared reset painted the page background onto every element. The reset now applies that background only to the document; component backgrounds remain explicit. The final diff contains no workflow change, API change, dependency, lockfile or protection change.

The dashboard routes link only to destinations already registered in current `main`; it does not depend on the separate Network Overview PR #577.

## Local validation

- Dashboard contract: 5/5 — PASS.
- Web `check:types`, ESLint, `format:check` and Prettier on changed files — PASS.
- Web build and release-manifest check — PASS; manifest reports `unavailable`, and the bundle retains the existing Sass deprecation and >500 kB chunk warnings.
- `git diff --check origin/main...HEAD` — PASS.
- Desktop (1440px) and mobile (390px) Chromium review — PASS: no horizontal overflow, page errors or text-background artifacts; all four journey filters render, selecting another filter updates its state, and invalid search shows its accessible validation message. The local auth response was stubbed; other API requests were blocked, so no account or backend data was used.
- No CI was manually triggered. Existing Sass deprecation and bundle-size warnings are unchanged; the release manifest reports `unavailable`.
