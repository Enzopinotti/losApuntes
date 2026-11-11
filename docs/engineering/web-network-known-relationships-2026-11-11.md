# Web Network — loaded relationship context in people search

**Base authority:** `main@13b45569874703b293bb484482e0ecc96d383934`.
**Scope:** `apps/web/src/pages/Network.tsx`, standalone presentation helper and stylesheet, existing Web Network contract test.
**Status:** implementation candidate. Exact-head CI, browser acceptance, and release readiness are separate gates.

## Product behavior

People search retains the explicit choice to follow a profile or request a connection. Previously every result offered **Seguir** and **Conectar**, even if the currently loaded network pages already established that the viewer followed the profile or had a pending/accepted relationship.

The results now display **Ya lo seguís** and hide a duplicate Follow action only when the profile is present in an already loaded Following page.

When a profile has a loaded connection:
- Incoming pending: show **Solicitud recibida**, hide Connect, and offer an accessible anchor to the existing incoming-request section.
- Outgoing pending: show **Solicitud enviada**, hide Connect.
- Accepted: show **Ya están conectados**, hide Connect.
- Declined or disconnected: show **Relación anterior finalizada** and offer **Volver a conectar**. The existing API supports re-requesting a terminal relation.
- Unknown/not present in loaded pages: preserve **Conectar**. An absent match is not represented as a definitive state because both lists are paginated.

A loaded follow does not imply an accepted connection, and a loaded connection does not imply a follow. These are independent actions. The profile link also encodes the profile identifier safely.

## Correctness and privacy boundaries

The helper is a pure projection over the existing authorized `GET /social/me/following` and `GET /social/me/connections` snapshots. It neither fetches additional private relationships nor infers them from academic institutions, interests or similar profile details.

Presentation is never a security or permission boundary: the API continues to verify all relationship mutations. The synchronous `NetworkActionGate`, session-bound asynchronous fences, bounded pagination, cursor-cycle checks and read-after-mutation refresh remain unchanged.

The UI explicitly explains that visible states apply only to pages already loaded. A stale terminal row does not override an active connection if conflicting snapshots appear. No persisted status, local storage, extra backend requests, new dependencies, migration or lockfile changes are introduced.

## Acceptance and limits

The canonical `pnpm test:web-network-presentation` now checks the mapping of follow, incoming/outgoing requests, accepted and terminal connections, empty/partial windows, conflicting snapshots, text/controls, 44px touch targets and visible keyboard focus.

Require exact-head `pnpm check` and B127 API/Web/Mobile formatting/types/lint, the critical domain coverage jobs, runtime smoke and the production dependency audit before merging. Browser verification with real pagination and a second user account remains a separate acceptance step, **NOT_RUN** unless evidenced.

Existing production HIGH vulnerability findings block release; no waiver or gate bypass is part of this change. Reconcile the Frontend planning ledger before marking a milestone complete.
