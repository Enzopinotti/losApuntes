# Study Practice pagination cursor recovery (B265)

Study Practice now keeps separate cursor histories for the subject question
list and the answer pages of the active practice question. The question list
history is scoped to the current viewer, subject, and navigation selection;
answer history is scoped to the active attempt and question. Reloading the
root list or question detail starts a new history for that page chain.

When a response repeats its current cursor or cycles to a previously requested
cursor, the page keeps the questions or answers already loaded, deduplicates
appended records, stops pagination, and shows a scoped message. Failed answer
page requests retain the existing retry behavior and do not consume a cursor.

## Validation

- `pnpm test:web-study-retry-round`
- `pnpm --filter @losapuntes/web check:types`
- Focused ESLint for Study Practice and the cursor helper
- `pnpm --filter @losapuntes/web build`
- Prettier, `pnpm check:hygiene`, and `git diff --check`

The production build writes the release manifest as `unavailable` in local
development because no deployment metadata is configured.
