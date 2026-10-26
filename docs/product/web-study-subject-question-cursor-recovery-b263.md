# Study Workbench question cursor recovery (B263)

The subject question explorer now tracks requested cursors for the current
session, subject, search text, and status filter. A successful root request
starts a fresh cursor history; a failed request does not consume its cursor.

If an appended page returns its own cursor again or points to a cursor already
requested in the same filter scope, the explorer keeps the questions already
loaded, deduplicates by question ID, stops pagination, and shows an explanation
with the existing retry action. The change preserves the current subject and
visibility filters and does not broaden the Q&A query.

## Validation

- `pnpm test:web-study-workbench`
- `pnpm --filter @losapuntes/web check:types`
- Focused ESLint for the explorer and cursor helper
- `pnpm --filter @losapuntes/web build`
- Prettier, `pnpm check:hygiene`, and `git diff --check`

The production build writes the release manifest as `unavailable` in local
development because no deployment metadata is configured.

## Main reconciliation review

The existing Chromium Workbench scenario now covers a question-page 500 that
preserves loaded records, recovery through the existing search restart action,
a cycle page-2/page-3/page-2 that retains the new question and deduplicates old
records, and pagination after restarting the same query following the cycle.
It retains subject/session scoping and independent resource source checks.
The explorer contract and four source cursor tests pass locally.
No CI was started or retried.
