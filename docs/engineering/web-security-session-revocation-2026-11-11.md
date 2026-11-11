# Security settings — single-flight session revocation and explicit reconciliation

**Baseline:** `main@13b45569874703b293bb484482e0ecc96d383934`
**Surface:** authenticated Web `/settings/security` (session inventory, revocation).
**Scope:** Web-only; no backend contracts, routes, database migrations, cookies, auth tokens, dependency graph, security exception rules or audit waivers.

## Problem and behavior

A disabled React button is not a synchronous lease. Rapid clicks on **Cerrar sesión**, **Cerrar todas las sesiones**, **Cambiar contraseña**, or **Desconectar Google** can race before React renders `busyAction`. The first request could also finish late after a different user session takes over.

The Web settings page now holds a synchronous, session-scoped lease for every sensitive action. A second action in the same authenticated scope is rejected until the first settles. On account/session transition a new scope can proceed, and an old request cannot release its lock.

A failed session DELETE is not always a rejected mutation: a timeout, lost network response, HTTP 408/429/5xx or invalid response can mean the server already closed the session. Treating it as a definitive failure and offering immediate retry creates misleading status and double-write risks.

For such failures the page:
- Records a scope-bound uncertain revocation, including single vs all sessions and whether it targeted the current session.
- Blocks new sensitive actions synchronously, **without** storing any session identifiers, auth data or passwords in browser persistence.
- Displays a visible status and **Verificar sesiones** control. No automatic DELETE retry is ever scheduled.
- On explicit verification, performs only a fresh authenticated `GET /auth/sessions`, updating the visible inventory from the result.
- If the target is still in the authoritative list, clears uncertainty and states it remains active. The user may choose a new attempt manually.
- If the target is absent from an **untruncated** valid inventory, confirms the remote session is no longer listed. For the current session, a still-authenticated GET is never used to falsely claim logout.
- If the session list is truncated or malformed, absence is **unknown**, not proof of revocation. Keep the uncertain status; user can repeat the read or consult support.
- If global revocation is uncertain and a fresh GET still succeeds, acknowledge only that the current session remains usable and that the **global result is unconfirmed**. Do not claim all other sessions are revoked. User can retry only by a new explicit action.
- If verification returns HTTP **401**, publish the auth authority change and return to login. An unrelated 403 is **not** treated as evidence of logout.
- If verification fails due to network, keep uncertainty and do not replay the DELETE.

A confirmed successful DELETE retains the existing server-authoritative logout or refresh behavior. Password validation, OAuth link/unlink requirements and the bounded session inventory remain unchanged.

## Quality and acceptance

The canonical `pnpm test:web-auth-contract` now runs pure Node tests and source guards for:
- Double clicks, concurrent sensitive actions, cross-user scope change and exact-identity lease releases.
- Error classes that are ambiguous vs definitive.
- Complete vs truncated session lists, malformed inventory, missing target and active target.
- No extra session DELETE call in the reconciliation path, and no local/session storage.
- Visible button, keyboard focus styling and at least 44px touch target.

Exact-head full `pnpm check`, B127 format/TypeScript/lint, critical domain coverage, container runtime smoke and production audit remain mandatory. Manual browser two-account cases (concurrent click, timeout, 401 and truncated inventory) must be executed separately; **NOT_RUN** until evidence is available.

**Release HOLD:** High-severity production dependency findings remain open in the project baseline; this feature does not claim to remediate those advisories or authorize a production merge. Keep the PR in DRAFT while that gate is red.
