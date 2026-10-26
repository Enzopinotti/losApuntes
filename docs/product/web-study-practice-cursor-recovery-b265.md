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
- B134–B139 Study Practice regression contracts and focused practice/export contracts
- `pnpm --filter @losapuntes/web check:types`
- `pnpm --filter @losapuntes/web lint`
- `pnpm --filter @losapuntes/web format:check`
- `pnpm --filter @losapuntes/web build`
- Prettier, `pnpm check:hygiene`, and `git diff --check`

The production build writes the release manifest as `unavailable` in local
development because no deployment metadata is configured.

## Main reconciliation review

The existing B182 Chromium scenario now exercises the actual practice screen:
question cursor cycle A-B-A, deduplication, independent answer cursor history
using the same cursor names, retry after a 500, and retention of new answers
on the cyclic page. Both pagination buttons disappear after their cycle.
The scenario also retains shortcut, editable-input and auth-loss coverage.

Local B134-B139, focused practice, B58 and practice integration contracts pass.
The production Vite build passes; deployment metadata remains unavailable.
No CI was started or retried.
