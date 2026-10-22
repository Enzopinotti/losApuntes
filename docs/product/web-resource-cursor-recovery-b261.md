# Web resource pagination cursor recovery (B261)

The Resources page now tracks cursors requested for the active discovery or
saved-resource list scope. Each new root request resets the history after a
successful response, while a transient failure leaves the requested cursor
available for retry.

When the server returns the current cursor again or points back to a cursor
already requested in the same list scope, the page keeps the resources already
loaded, deduplicates any returned items, stops pagination, and shows a
recoverable error message. Changing the query, selected filters, or list view
isolates the new list from the old cursor history.

## Validation

- `pnpm test:web-resources-contract`
- `pnpm --filter @losapuntes/web check:types`
- Focused ESLint for `Resources.tsx` and the cursor helper
- `pnpm --filter @losapuntes/web build`
- Prettier, repository hygiene, and `git diff --check`

The production build writes the release manifest as `unavailable` in local
development because no deployment metadata is configured.
