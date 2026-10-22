# Study planner material search cursor recovery (B264)

The material finder in the Study Session planner now tracks requested cursors
for the active authenticated search scope, including material kind, subject,
query, and question status. A successful root response starts a new cursor
history. A failed page request leaves its cursor available through the existing
retry action.

When a returned page repeats its own cursor or points back to a previously
requested cursor, the finder preserves and deduplicates the already loaded
results, stops pagination, and explains why the search stopped. Resource and
question searches remain subject-scoped and continue using their existing
visibility checks.

## Validation

- `pnpm test:web-study-plan-material-finder`
- `pnpm --filter @losapuntes/web check:types`
- Focused ESLint for the finder and cursor helper
- `pnpm --filter @losapuntes/web build`
- Prettier, `pnpm check:hygiene`, and `git diff --check`

The production build writes the release manifest as `unavailable` in local
development because no deployment metadata is configured.
