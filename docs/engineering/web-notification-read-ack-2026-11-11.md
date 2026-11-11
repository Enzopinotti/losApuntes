# Web Notifications: confirmed reads and reconciliation (candidate)

**Baseline:** `main@13b45569874703b293bb484482e0ecc96d383934`.
**Scope:** Web Notifications only; existing API and auth authority unchanged.
**Applicable requirements:** `NOTIF-FR-002`, `NFR-REL-001`, `NFR-UX-001`, `NFR-A11Y-001`.
**Planning ledger:** reconcile the existing Frontend backlog row before declaring delivery closed; do not invent an external key.
**Status:** candidate implementation. CI, browser acceptance and release readiness require separate evidence.

## Problem

A notification can be marked read by the server even if the client loses the response. Previous Web code ignored the read result from `PATCH /notifications/:id/read` and `POST /notifications/read-all`; the UI could announce a refresh without a confirmed acknowledgement. Rapid clicks could also start overlapping mutations before React committed its disabled state.

## Behavior

- `PATCH /notifications/:id/read` is confirmed only when the server returns `{read: true}`.
- `POST /notifications/read-all` is confirmed only with `{updated: nonnegative safe integer}`. An update count of zero is valid.
- A definitive HTTP 4xx other than 408/429 keeps the current error flow, without falsely confirming the write.
- Unknown outcomes (network loss, timeout, 408/429, 5xx, malformed success payload) disable new notification mutations until the user explicitly selects **Actualizar bandeja** and the server's authoritative first-page GET succeeds.
- A synchronous, session-scoped lease prevents double-click races; completion of an old-session request cannot release a newer session's lease.
- Opening an unread notification navigates only after a confirmed read. Already-read links preserve normal navigation behavior outside an uncertain operation.
- Category filters remain view-only and counts remain limited to loaded pages. No local role or persisted cache grants permission.
- Background polling never clears the uncertain-write gate. A pre-existing in-flight GET cannot silently resolve a later uncertain write.
- No new endpoints, dependencies, backend permissions, storage keys, schema, lockfile or telemetry.

## Acceptance

The canonical `test:web-social-qa-contract` checks acknowledgement payloads, ambiguous status classification, cross-session lease behavior, mutation gating, explicit refresh and accessible touch target.

Also require candidate-exact `pnpm --filter @losapuntes/web check:types`, Web lint, Web Prettier, `pnpm check`, critical contracts and workflow verify. Browser behavior under multi-tab, offline and recovery should be reviewed separately before calling the UX fully accepted.

Merge readiness and production readiness are separate. The existing HIGH dependency-audit failure remains a blocking release condition. Do not waive production audit or rewrite its status as PASS to merge.
