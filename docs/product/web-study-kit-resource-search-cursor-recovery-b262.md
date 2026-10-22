# Study Kit resource search cursor recovery (B262)

The resource finder inside Study Kits now tracks requested pagination cursors
for the active user, subject, and normalized search query. A new successful
root search clears the previous cursor history; a failed request does not mark
its cursor as consumed.

If an appended page returns its own cursor again or points back to an earlier
requested cursor, the finder keeps the resources already loaded, filters them
to the selected subject, deduplicates by resource ID, stops pagination, and
shows a message explaining the repeated page. The safeguard stays inside the
existing authenticated, subject-scoped resource search.

## Validation

- `node scripts/test-web-study-kits-integration.mjs`
- `pnpm --filter @losapuntes/web check:types`
- Focused ESLint for the finder and cursor helper
- `pnpm --filter @losapuntes/web build`
- Prettier, `pnpm check:hygiene`, and `git diff --check`

The production build writes the release manifest as `unavailable` in local
development because no deployment metadata is configured.
