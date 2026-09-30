# Bounded Auth session inventory

**Canonical issue:** #88  
**Scope:** `GET /auth/sessions` inventory only.

## Problem

A valid account can accumulate more Auth session rows than a UI should read,
serialize and render in one request. The previous Mongo query used
`.find().sort().exec()` with no server-side limit, so its cost grew with the
account's history.

The inventory endpoint must stay bounded without silently changing which
credentials remain valid.

## Policy

`AUTH_SESSION_INVENTORY_LIMIT = 20` is a **visibility budget**, not a maximum
number of valid credentials.

The system does not revoke or delete an otherwise valid session just because it
falls outside the inventory window.

The response is:

```ts
{
  sessions: AuthSession[];
  truncated: boolean;
  limit: number;
}
```

When `truncated === true`:

- additional active sessions exist outside the returned window;
- those sessions remain valid;
- individual revoke is available for returned session ids;
- `DELETE /auth/sessions` revokes all account sessions, including sessions not
  visible in the current window.

This avoids silent device eviction. A future paginated Security inventory may
replace the bounded-window UX without changing credential validity.

## What consumes the budget

Mongo filters before applying the limit:

- account `userId`;
- current `credentialVersion`;
- absolute `expiresAt`;
- Web idle boundary;
- Mobile idle boundary.

The store requests `limit + 1` rows. The extra row is only a sentinel used to
compute honest truncation and is never serialized as part of the visible
window.

## Ordering and current-session preservation

The primary order is:

1. `lastSeenAt DESC`;
2. `sessionId DESC` as a stable tie-breaker.

If overflow exists and the authenticated current session is not in the first
window, the service performs one bounded id lookup for that session and
replaces the last visible row. This guarantees that Security can still identify
the session the user is currently using.

The replacement does not make the response complete; `truncated` remains
true.

## Index

The session schema keeps the TTL index and adds an inventory-oriented compound
index over:

- `userId`;
- `credentialVersion`;
- `clientType`;
- `lastSeenAt`;
- `sessionId`.

The absolute-expiry predicate remains bounded by the TTL lifecycle and query
filter.

## Web

The Security page must disclose truncation explicitly. It must never imply that
the visible rows are the complete set when `truncated === true`.

The notice also explains that “Cerrar todas las sesiones” includes hidden
sessions.

## Mobile

Mobile already consumes `AuthSessionListResponse` through
`AuthenticatedMobileApi`, but no native Security/session-inventory screen
exists yet.

The shared response retains `truncated` and `limit` now so a future Mobile
surface cannot accidentally assume the first window is the complete inventory.

## Tests

Required regression evidence:

- exactly `limit` rows -> `hasMore=false`;
- `limit + 1` rows -> only `limit` returned and `hasMore=true`;
- DB query includes credential version, TTL and client-specific idle cutoffs;
- current session is preserved under overflow;
- controller returns truncation metadata unchanged;
- Web contract requires visible truncation disclosure;
- Mobile/shared contract preserves `truncated` and `limit`.

## Non-goals

This change does not impose a hard maximum number of active credentials and
does not silently prune oldest devices during login.

If product requirements later need a hard device/session cap, that must be a
separate explicit policy with stable error/eviction semantics and concurrency
tests.
