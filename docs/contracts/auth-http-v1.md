# Identity/Auth v1 — HTTP contract

Parent: #4

This is the target public contract for Web/Mobile integration. Endpoints may land incrementally, but once a client depends on a stable error code/shape it becomes a compatibility contract.

All Auth responses use:

`Cache-Control: no-store`

All errors use the repository error envelope with a public `requestId`.

## Shared account projection

Auth returns a minimal account projection, not the full academic Profile:

```json
{
  "user": {
    "id": "stable-account-id",
    "email": "student@example.com",
    "emailVerified": true,
    "status": "active"
  }
}
```

No password hash, session hash, provider token, role-name authorization snapshot or academic membership belongs here.

A later product bootstrap may combine Profile/Academic Context separately.

---

## POST /auth/register

Purpose: start/continue email+password registration.

Request:

```json
{
  "email": "student@example.com",
  "password": "long password"
}
```

Optional future request metadata such as required Terms version must be explicit and versioned; do not accept arbitrary extra keys.

Success:

`202 Accepted`

```json
{
  "accepted": true
}
```

Public semantics are intentionally bounded across new/existing-email cases.

Errors:

- `400 BAD_REQUEST`
- `400 INVALID_PASSWORD`
- `429 RATE_LIMITED` when reviewed abuse controls are active

No normal authenticated session is issued before verification.

---

## POST /auth/email-verification/request

Purpose: request/resend verification.

Request:

```json
{
  "email": "student@example.com"
}
```

Success:

`202 Accepted`

```json
{
  "accepted": true
}
```

Public response does not reveal whether the email belongs to an existing account.

---

## POST /auth/email-verification/inspect

Request:

```json
{
  "token": "one-time-bearer"
}
```

Success:

`200 OK`

```json
{
  "verification": {
    "available": true
  }
}
```

Unavailable:

- `410 VERIFICATION_NOT_AVAILABLE`

The raw token is never returned.

---

## POST /auth/email-verification/complete

Request:

```json
{
  "token": "one-time-bearer"
}
```

Success:

`204 No Content`

The operation verifies the email claim but does not automatically create a long-lived session in v1.

Unavailable/replayed/expired:

- `410 VERIFICATION_NOT_AVAILABLE`

---

## POST /auth/login

Purpose: Web email/password login.

Request:

```json
{
  "email": "student@example.com",
  "password": "long password"
}
```

Success:

`200 OK`

- sets Web HttpOnly session cookie;
- does not return raw session token.

Body:

```json
{
  "user": {
    "id": "stable-account-id",
    "email": "student@example.com",
    "emailVerified": true,
    "status": "active"
  },
  "session": {
    "id": "public-session-id",
    "clientType": "web",
    "createdAt": "RFC3339",
    "expiresAt": "RFC3339",
    "current": true
  }
}
```

Errors:

- `401 INVALID_CREDENTIALS`
- `403 EMAIL_VERIFICATION_REQUIRED` only after credentials otherwise verify
- `403 ACCOUNT_RESTRICTED` where product policy allows the status to be public to the authenticated credential holder
- `429 RATE_LIMITED`

---

## POST /auth/mobile/login

Purpose: Mobile email/password login using the same account/session authority.

Request body is identical to Web login.

Success:

`200 OK`

```json
{
  "user": {
    "id": "stable-account-id",
    "email": "student@example.com",
    "emailVerified": true,
    "status": "active"
  },
  "session": {
    "id": "public-session-id",
    "clientType": "mobile",
    "createdAt": "RFC3339",
    "expiresAt": "RFC3339",
    "current": true
  },
  "sessionToken": "opaque-native-credential"
}
```

`sessionToken` exists only on the native issuance contract and must be stored in SecureStore/equivalent.

Web must never use this endpoint as its normal login path.

---

## GET /auth/me

Accepts exactly one supported session transport.

Web: HttpOnly cookie.

Mobile: Authorization Bearer.

Success:

`200 OK`

```json
{
  "user": {
    "id": "stable-account-id",
    "email": "student@example.com",
    "emailVerified": true,
    "status": "active"
  },
  "session": {
    "id": "public-session-id",
    "clientType": "web",
    "createdAt": "RFC3339",
    "expiresAt": "RFC3339",
    "current": true
  }
}
```

Unauthenticated/expired/revoked:

- `401 AUTHENTICATION_REQUIRED`

Restricted account:

- stable account-status response according to policy.

---

## DELETE /auth/session

Logout current session.

Web:

- revoke if current session resolves;
- always clear session cookie.

Mobile:

- revoke current bearer session when it resolves;
- client also clears SecureStore locally.

Success:

`204 No Content`

Idempotent.

---

## GET /auth/sessions

Requires authenticated session.

Success:

`200 OK`

```json
{
  "sessions": [
    {
      "id": "session-id",
      "clientType": "mobile",
      "createdAt": "RFC3339",
      "lastSeenAt": "RFC3339",
      "expiresAt": "RFC3339",
      "current": false
    }
  ]
}
```

Only active/non-expired sessions are returned.

No token/hash/IP/precise location/full User-Agent.

---

## DELETE /auth/sessions/:sessionId

Requires authenticated session.

Revokes one owned session.

Success:

`204 No Content`

Unknown/malformed/another-user target should not become an existence oracle.

If current session is revoked:

- Web cookie is cleared;
- Mobile client clears its credential after success.

---

## DELETE /auth/sessions

Requires authenticated session.

Revokes all account sessions including current.

Success:

`204 No Content`

Current credential/cookie becomes unusable.

---

## POST /auth/password/change

Requires authenticated session and current password for password-backed account.

Request:

```json
{
  "currentPassword": "current password",
  "newPassword": "new long password"
}
```

Success:

`204 No Content`

Security outcome:

- password updated;
- all sessions revoked;
- current Web cookie cleared where applicable;
- Mobile clears local credential;
- user must login again.

Errors:

- `401 AUTHENTICATION_REQUIRED`
- `400 INVALID_CURRENT_PASSWORD`
- `400 INVALID_PASSWORD`
- `409 PASSWORD_CHANGE_CONFLICT`

---

## POST /auth/password/recovery/request

Request:

```json
{
  "email": "student@example.com"
}
```

Success always bounded:

`202 Accepted`

```json
{
  "accepted": true
}
```

No account existence disclosure.

---

## POST /auth/password/recovery/inspect

Request:

```json
{
  "token": "one-time-recovery-bearer"
}
```

Success:

`200 OK`

```json
{
  "recovery": {
    "available": true
  }
}
```

Unavailable:

- `410 RECOVERY_NOT_AVAILABLE`

---

## POST /auth/password/recovery/complete

Request:

```json
{
  "token": "one-time-recovery-bearer",
  "newPassword": "new long password"
}
```

Success:

`204 No Content`

Security outcome:

- one-time token consumed;
- password updated;
- every active session revoked;
- no auto-login.

Errors:

- `400 INVALID_PASSWORD`
- `410 RECOVERY_NOT_AVAILABLE`
- `409 PASSWORD_CHANGE_CONFLICT` if stale/concurrent credential mutation is detected

---

## Google OAuth Web

Planned contract:

### GET /auth/google/start

Starts OAuth flow with server-generated state and required PKCE/state material.

May redirect to Google.

### GET /auth/google/callback

Provider callback only.

Server:

- validates state;
- exchanges code;
- validates provider identity/email verification;
- applies explicit account-link rules;
- creates normal Web AuthSession;
- redirects to one allow-listed frontend destination.

Provider tokens/codes are never returned to app pages.

Exact implementation lands in #42 after fresh provider credentials/config exist.

---

## Google OAuth Mobile

Mobile needs a native provider/browser flow and allow-listed deep-link/app-link return.

The final provider proof is exchanged server-side and ends in the same AuthSession authority as password login.

Do not store Google provider tokens as the Los Apuntes session.

---

## Unsafe Web request origin check

For cookie-authenticated POST/PUT/PATCH/DELETE:

- require trusted Web Origin validation;
- mismatch => `403 CSRF_VALIDATION_FAILED`;
- Bearer-auth native requests do not use browser Origin as session authority.

---

## Strict parsing

Auth mutation routes reject unknown keys.

Bound:

- email length;
- password length;
- token length/pattern;
- session ID format.

Do not forward arbitrary body objects into repositories.

---

## Client error behavior

Clients branch on stable `code`, never localized message text.

Suggested UX mapping:

| Code | UX |
| --- | --- |
| `INVALID_CREDENTIALS` | “Email o contraseña incorrectos.” |
| `EMAIL_VERIFICATION_REQUIRED` | verification-required screen + resend |
| `AUTHENTICATION_REQUIRED` | clear session + login, preserving safe local draft |
| `ACCOUNT_RESTRICTED` | account-status screen |
| `INVALID_PASSWORD` | show current password policy |
| `INVALID_CURRENT_PASSWORD` | field-level current-password error |
| `VERIFICATION_NOT_AVAILABLE` | expired/unavailable verification + resend |
| `RECOVERY_NOT_AVAILABLE` | expired/unavailable recovery + request new |
| `PASSWORD_CHANGE_CONFLICT` | ask user to retry/re-login |
| `RATE_LIMITED` | bounded retry/cooldown state |
| unknown 5xx | generic error + public requestId |

Human messages may localize independently.

---

## Integration rule for Belén

Web and Mobile must consume this contract through one shared typed contract layer when the endpoints become real.

Client code must not:

- invent account authority;
- store Web bearer token;
- derive auth from profile/academic fields;
- treat network error as logout;
- string-match Spanish/English server messages;
- reuse stale auth responses after a newer auth operation;
- bypass verification/restriction state because a screen route is reachable.
