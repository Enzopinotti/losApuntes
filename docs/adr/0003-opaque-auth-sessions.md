# ADR 0003 — Use opaque revocable sessions for Web and Mobile

- Status: Accepted for Identity/Auth v1
- Date: 2026-09-22

## Context

The rescued Los Apuntes API uses short-lived JWT access tokens containing `sub` and scalar `role`. The rescued Web frontend stores a fake token/user in localStorage.

The 2026 product requires:

- immediate logout/revocation;
- session inventory;
- revoke one/all sessions;
- password-change/recovery revoke-all;
- future restriction/compromise handling;
- Web HttpOnly credentials;
- Mobile SecureStore credential;
- one account authority shared by both clients.

The existing JWT shape also risks carrying stale role/domain state into authorization.

## Decision

Los Apuntes v1 will use a server-stored opaque AuthSession.

A session bearer token is random and unstructured. Only its cryptographic hash is persisted.

Web receives the raw token only through a host-only HttpOnly Secure cookie.

Mobile receives a raw opaque session credential only through the native issuance contract and stores it in platform secure storage.

Both resolve the same server-side AuthSession and Account.

Session tokens contain no role, Profile or Academic Graph claims.

## Browser CSRF

Web cookie uses SameSite=Lax and unsafe cookie-authenticated requests validate the exact configured Web Origin.

The browser never receives its raw session bearer token in JSON.

## Mobile

Mobile uses Authorization Bearer with the same AuthSession authority.

This is a transport difference, not a separate authentication system.

## Session lifetime

Initial absolute lifetime: 30 days.

No implicit infinite sliding session in v1.

## Alternatives considered

### Keep access JWT only

Rejected.

Immediate revoke/session inventory/password-change revoke-all become awkward or require a revocation/session store anyway. Embedded claims can become stale.

### Access + refresh JWT rotation

Not selected for v1.

It can be secure but adds two-token lifecycle, rotation races, replay handling and revocation state when Los Apuntes already needs server-side sessions.

### Separate Web and Mobile auth systems

Rejected.

It creates duplicate identity/security semantics and violates the shared-backend product contract.

### Browser token in localStorage

Rejected.

It exposes a durable bearer credential directly to JavaScript/XSS and repeats the legacy frontend problem.

## Consequences

Positive:

- simple revocation authority;
- one session inventory;
- no stale embedded role/academic claims;
- clear Web/Mobile transport split;
- password recovery/change can invalidate every session centrally.

Trade-offs:

- each authenticated request needs session-state lookup or a safe future cache;
- session persistence must be migrated if the primary database changes;
- Mobile bearer issuance needs disciplined client handling;
- future multi-region/session-cache work must preserve revocation semantics.

## Persistence independence

The conceptual AuthSession contract does not decide the Academic Graph database.

A temporary Mongo adapter may implement AuthSession while the rescued backend remains on Mongo, but repository/service boundaries must keep that adapter replaceable.

The future persistence ADR may move AuthSession storage without changing Web/Mobile public semantics.
