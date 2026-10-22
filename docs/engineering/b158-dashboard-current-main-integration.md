# B158 Dashboard current-main integration evidence

## Identity and base

- Source PR: [#578](https://github.com/Enzopinotti/losApuntes/pull/578), Draft.
- Published source HEAD: `0d9b43f98d7fce283c3bbdc72b96f2892c8d0b58`.
- Reconciled base: `origin/main@7184c9ca374fec6e694ae38ef6bed0fadf1f617a`.
- The nine functional commits remain in order; this evidence is a separate commit. The two source commits that changed a workflow are excluded.

## Integration notes

Rebase produced one conflict in the root test chain. The resolution keeps `test:web-study-task-verification` from #570 and adds `test:web-dashboard-b158` to both the root test chain and script declarations. The final diff contains no workflow change, API change, dependency, lockfile or protection change.

The dashboard routes link only to destinations already registered in current `main`; it does not depend on the separate Network Overview PR #577.

## Local validation

- Dashboard contract: 5/5 — PASS.
- Web `check:types`, ESLint, `format:check` and Prettier on changed files — PASS.
- Web build and release-manifest check — PASS; manifest reports `unavailable`, and the bundle retains the existing Sass deprecation and >500 kB chunk warnings.
- `git diff --check origin/main...HEAD` — PASS.
- No CI or browser visual acceptance was run. The source PR remains Draft pending visual review and existing release gates.
