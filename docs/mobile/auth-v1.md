# Mobile Auth v1 — native implementation contract

**Issues:** #49 / #7  
**Status:** implementation carrier

## Product rule

Mobile is a consumer of existing Identity/Auth semantics. It must not invent another account source, refresh-token authority, role authority or academic authority.

## Required journeys

1. cold-start credential restore;
2. email/password registration;
3. verification pending + resend;
4. verification deep link inspect/complete;
5. password login;
6. forgot password;
7. recovery deep link inspect/complete;
8. logout with local-first credential clearing;
9. active session inventory;
10. revoke one session;
11. revoke all sessions;
12. authenticated password change;
13. restricted-account state;
14. Google availability/login;
15. Google link/unlink with reauthentication.

## Credential lifecycle

```text
SecureStore credential
  -> restore snapshot generation N
  -> GET /auth/me with bearer
  -> authenticated only if server accepts current credential
```

Login candidate:

```text
POST /auth/mobile/login
  -> candidate opaque credential
  -> persist candidate securely
  -> adopt generation N+1
  -> authenticated
```

Logout:

```text
advance generation
-> clear in-memory authority immediately
-> clear SecureStore
-> best-effort DELETE /auth/session using captured old credential
```

An older request can mutate session state only when both its credential and generation still match the authoritative snapshot.

## Transport error taxonomy

The API client maps failures into stable client categories:

- unauthorized;
- forbidden/restricted;
- validation;
- conflict;
- gone/expired action;
- offline/network;
- timeout;
- server unavailable;
- unexpected.

When a server body contains a stable `code`, UI logic branches on that code. Human-readable server messages are display fallback only.

## Action-token handling

Verification/recovery tokens are never persisted.

A deep-link parser accepts only the Los Apuntes scheme/allow-listed HTTPS host and known Auth action paths. It extracts the token into an in-memory vault, replaces navigation with a token-free route, then the flow immediately inspects the token through the API.

Completion consumes and clears the vault entry regardless of success/failure terminal state.

## Secure storage

Only the opaque Los Apuntes session credential belongs in SecureStore.

Do not place in SecureStore:

- password;
- Google ID/access token;
- verification/recovery action token;
- profile/cache/feed data;
- analytics identity snapshots.

## Native acceptance evidence still required

Code-level CI can prove type safety, state-machine behavior, no forbidden persistence imports and static deep-link/transport contracts.

Closing #49 additionally requires a real native development/release build proving at minimum:

- SecureStore round trip on supported iOS/Android target;
- cold restore;
- logout/revocation;
- one email action deep link;
- Google provider behavior when configured;
- keyboard/autofill/accessibility sanity on a small-screen device/simulator.

Until that evidence exists, the issue stays open.
