# Identity/Auth v1.4 — Account security implementation contract

Parent: #4  
Implementation lane: #41

## Purpose

This document defines the security invariants behind the Account > Security experience.

It builds on:

- opaque AuthSession authority;
- credential-version fencing;
- one-time recovery/verification tokens.

It does not choose the final Academic Graph persistence.

---

## 1. Account status

Conceptual values:

- `active`;
- `restricted`.

Legacy records without the field are interpreted as active.

Account status is server state.

It must never be trusted from:

- session bearer contents;
- client cache;
- route state;
- Profile;
- legacy role.

### Login

After correct password proof:

- restricted => `ACCOUNT_RESTRICTED`;
- unverified active => `EMAIL_VERIFICATION_REQUIRED`;
- verified active => session issuance.

Wrong password / unknown email remain `INVALID_CREDENTIALS`.

### Existing sessions

AuthSessionGuard re-loads account state.

Restricted account fails closed even if:

- cookie is syntactically valid;
- session record still exists;
- credentialVersion still matches.

---

## 2. Password service boundary

Password hashing/verification belongs to one service.

All callers use it:

- registration;
- login;
- password recovery;
- authenticated password change.

Current v1 algorithm may remain bcrypt with cost 12 for compatibility.

The public API never exposes algorithm details.

This boundary allows a future migration to a versioned memory-hard hash without rewriting every Auth flow.

---

## 3. Shared password policy

New password policy:

- minimum 12 characters;
- maximum 256;
- Unicode string;
- no arbitrary composition rules.

Applied to:

- registration;
- recovery;
- authenticated password change.

The **current** password field during reauthentication accepts the existing credential within the maximum length; it must not require the new-password minimum.

---

## 4. Authenticated password change

Security inputs:

- authenticated active session;
- expected credentialVersion from the authenticated request;
- current password;
- new password.

Flow:

1. load account;
2. require active status;
3. require account credentialVersion == session credentialVersion;
4. verify current password;
5. hash new password;
6. compare-and-swap password + increment credentialVersion;
7. invalidate remaining password-recovery tokens where possible;
8. best-effort delete all session records;
9. emit sanitized audit event;
10. send security notification best-effort;
11. issue no new session.

The credential-version increment is the authority boundary.

Session deletion is cleanup.

---

## 5. Password-change races

### Two simultaneous password changes

Both may verify the same old password.

Only one CAS against the old credentialVersion can succeed.

The loser receives conflict/stale state and cannot overwrite the winner.

### Password change racing recovery

Both operations use the same credentialVersion CAS.

Only one credential mutation wins.

The other action becomes stale.

### Session request racing password change

Once credentialVersion advances, subsequent authorization using the old session fails closed.

A request already authorized before the change is governed by its own operation transaction/authorization boundary; sensitive downstream operations may need additional fencing when they exist.

---

## 6. Error semantics

Expected stable codes:

- `AUTHENTICATION_REQUIRED`
- `ACCOUNT_RESTRICTED`
- `INVALID_CURRENT_PASSWORD`
- `INVALID_PASSWORD`
- `PASSWORD_CHANGE_CONFLICT`

Do not reveal:

- password hash;
- credentialVersion value;
- session token;
- Mongo write-result detail.

---

## 7. Cookie/Mobile consequences

Web password-change success:

- HTTP 204;
- clear Web session cookie;
- old cookie is stale even if client ignores clear response.

Mobile password-change success:

- HTTP 204;
- app clears SecureStore credential;
- old bearer is stale even if client fails to clear it.

No auto-login.

---

## 8. Recovery-token cleanup

Password change increments credentialVersion.

Existing recovery tokens issued against the old version are therefore immediately stale.

The implementation should additionally invalidate outstanding recovery tokens as cleanup.

Failure to clean them up must not restore authority.

---

## 9. Account restriction semantics

A restricted account must not:

- obtain new normal sessions;
- use an existing AuthSession;
- bypass restriction using Mobile vs Web transport.

Restriction is independent from content moderation flags and legacy role.

### Future status mutation

When an administrative/moderation surface eventually changes account status, the operation should explicitly decide whether to:

- increment credentialVersion;
- revoke sessions;
- send notification;
- emit audit event.

That management endpoint is outside #41.

---

## 10. Auth audit sink

Security actions emit through a narrow `AuthAuditSink`.

The sink is persistence-independent.

Initial implementation:

- structured application logging.

Minimum events:

- `auth.password.changed`;
- `auth.session.revoked`;
- `auth.session.revoked_all`;
- `auth.password.recovery.completed`;
- `auth.email.verified`.

Future status-management events:

- `auth.account.restricted`;
- `auth.account.restored`.

### Allowed fields

Where useful:

- event name;
- server-derived account/user ID;
- target session public ID;
- client type;
- timestamp.

### Forbidden fields

- password;
- raw session token;
- session token hash;
- cookie;
- action token;
- action token hash;
- provider secret;
- email body.

Audit sink failure must not undo a completed security action.

---

## 11. Durable security history

A structured logger is not automatically a permanent audit database.

Before adding durable/user-visible security history, decide:

- retention duration;
- privacy/legal basis;
- deletion/anonymization behavior;
- who can query it;
- whether IP/device signals are stored;
- incident-response requirements.

Do not silently accumulate indefinite identity/security telemetry.

---

## 12. Session-management audit

Targeted revoke:

- ownership remains server-scoped;
- unknown/other-user session ID returns the same safe HTTP outcome;
- emit audit only when the authenticated user performs the action;
- public target session ID is safe to include internally if retention policy permits.

Revoke all:

- invalidates all records;
- current session becomes unusable;
- emit one account-scoped event.

Normal idempotent logout may remain ordinary request logging unless product/security policy later requires a distinct audit event.

---

## 13. Security notification

Authenticated password change should send a best-effort confirmation email after the credential mutation succeeds.

Delivery failure:

- logs bounded internal event;
- does not roll back password change;
- never includes secret material.

Suggested user action if unrecognized:

- immediately start password recovery.

---

## 14. Email change

Not implemented in #41.

Future secure contract:

- authenticated active account;
- explicit reauthentication;
- new-email action token bound to account + proposed address;
- verify new mailbox;
- notify old mailbox;
- uniqueness/CAS on final swap;
- session revocation policy;
- audit.

Never replace canonical email before verifying new ownership.

---

## 15. Account closure

Not implemented in #41.

Auth cannot decide hard deletion in isolation because shared domain data may need:

- anonymization;
- attribution retention;
- tombstone;
- transfer;
- moderation evidence.

No `DELETE /users/:id` shortcut should be added as an account-close substitute.

---

## 16. Tests

Required evidence:

- account-status default compatibility;
- restricted login after correct password;
- wrong password does not reveal restricted state;
- existing session rejected when account restricted;
- shared PasswordService used across flows;
- current-password failure does not mutate version/hash;
- password change CAS increments version once;
- concurrent changes have one winner;
- recovery/change race has one winner;
- all old sessions fail after success;
- recovery tokens become stale/cleaned;
- cookie clear contract;
- audit payloads contain no secrets;
- security notification failure does not roll back change.

Runtime smoke:

- verification + login;
- create Web and Mobile sessions;
- authenticated password change;
- both old sessions rejected;
- old password rejected;
- new password succeeds;
- security email observed through Mailpit.
