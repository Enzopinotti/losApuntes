# Identity/Auth v1.4 — One-time action token security contract

Parent: #4  
Implementation lane: #40

## Purpose

Email verification and password recovery use narrow one-time bearer tokens.

These tokens are not sessions, API keys or OAuth credentials. Their authority is limited to one action purpose and one account lifecycle.

This contract must survive a future persistence migration unchanged at the product/security level.

---

## 1. Token primitive

Verification and recovery tokens:

- use 32 cryptographically random bytes;
- are base64url encoded;
- are unstructured;
- contain no user ID, email, role or claims;
- are persisted only as SHA-256 digests;
- use a public UUID action-token record ID separate from the bearer;
- have a bounded TTL;
- have exactly one purpose.

Purposes:

- `email_verification`;
- `password_recovery`.

Raw tokens exist only transiently for issuance/delivery/client submission.

They must never be stored in:

- database fields;
- application logs;
- audit payloads;
- analytics;
- error metadata;
- session records.

---

## 2. TTLs

Current v1 policy:

- email verification: 24 hours;
- password recovery: 30 minutes.

TTL is server authority.

Client countdowns are presentation only.

Expired tokens are unavailable even if a stale email/link still exists.

---

## 3. Hash-only lookup

The server hashes the presented bearer before persistence lookup.

Malformed tokens fail before persistence lookup where possible.

A database leak of action-token records must not directly reveal usable bearer links.

SHA-256 is appropriate here because the token has full cryptographic entropy; this is not password hashing.

---

## 4. Atomic claim

A usable token has no `consumedAt`.

Claiming uses one persistence operation that matches:

- token hash;
- purpose;
- unconsumed state;
- non-expired state.

The same operation sets `consumedAt` and records `consumedReason=claimed`.

Non-claim invalidation records `consumedReason=invalidated`.

Two consumers of the **same token** cannot both claim it successfully.

This is the anti-replay boundary. Claim provenance is retained only so a monotonic email-verification completion can reconcile an ambiguous response without making invalidated tokens reusable.

---

## 5. Multiple outstanding links

A blind resend must not trivially invalidate the user's previously received valid link.

Policy:

- issue cooldown: 60 seconds;
- at most 3 active tokens per account/purpose;
- older valid links can remain usable until:
  - one succeeds;
  - TTL expires;
  - active-token cap removes older tokens.

The active-token cap is enforced with a bounded retention operation:

1. read only the 3 newest active rows for the account/purpose;
2. order by `createdAt DESC, tokenId DESC`;
3. use the third retained row as a stable cutoff;
4. invalidate every still-active row strictly older than that cutoff with one
   server-side `updateMany`.

The service never materializes the full active-token set in memory.

The cutoff is intentional for concurrency safety. A token created after the
retained read is newer than the cutoff, so the cleanup query does not
accidentally invalidate it.

If fewer than 3 active rows exist, no overflow update is issued.

After successful verification or recovery, remaining same-purpose tokens are invalidated.

---

## 6. Concurrent issuance

Persistence enforces one issuance bucket per:

- user;
- purpose;
- 60-second bucket.

The service also checks latest active issuance time.

The bucket uniqueness constraint is a concurrency backstop, not the only product cooldown logic.

This prevents duplicate issuance from concurrent requests in the same bucket.

---

## 7. Email verification semantics

Verification action token is bound to:

- account/user;
- `email_verification` purpose.

It does not need a credential version because the operation is monotonic:

`unverified -> verified`.

Completion:

1. claim token atomically, or resolve the same retained token only when its persisted consumption reason is `claimed`;
2. resolve account;
3. if the account is already verified, reconcile the completion as success;
4. otherwise mark email verified only if still unverified;
5. if that compare-and-set loses, re-read once and accept only an observed verified account;
6. invalidate remaining verification tokens;
7. issue no session.

This makes the monotonic verification mutation idempotently reconcilable after a lost response or a failure after claim. A token consumed for delivery failure, overflow trimming, sibling invalidation or any other non-claim reason remains unavailable.

Concurrent valid verification links may both be claimed, but they converge on the same verified account state.

---

## 8. Password recovery semantics

Recovery token is bound to:

- account/user;
- `password_recovery` purpose;
- credential version at issuance.

Completion:

1. claim token;
2. load account;
3. require current credential version == token credential version;
4. derive replacement password hash;
5. compare-and-swap password + increment credential version;
6. invalidate remaining recovery tokens;
7. best-effort remove old session records;
8. send security confirmation;
9. issue no new session.

The **credential version increment** is the immediate security boundary.

Session deletion is cleanup.

---

## 9. Credential-version fencing

Every AuthSession records the credential version present at issuance.

Every authenticated request resolves the current account security state.

If:

`session.credentialVersion != account.credentialVersion`

the request fails closed and that stale session is revoked/cleaned up when possible.

Therefore, after successful recovery:

- every pre-reset Web cookie is stale;
- every pre-reset Mobile bearer is stale;
- cleanup failure cannot preserve authentication authority.

---

## 10. Recovery race invariant

Two different recovery links can exist simultaneously.

If both were issued at credential version 1 and race:

- both may successfully claim their independent one-time token;
- only one compare-and-swap password update from version 1 -> 2 can succeed;
- the second sees stale credential version and cannot overwrite the new password.

This is the account-level race boundary.

The losing token remains consumed. The user can request another recovery if needed.

---

## 11. Failure semantics after claim

Password recovery remains fail-closed after claim because credential replacement is not replayed from a consumed bearer.

Email verification is different because the authoritative transition is monotonic. For that purpose only:

- a consumed token is reconcilable only when persistence proves it was consumed by an actual completion claim;
- invalidated/revoked/trimmed tokens never become reconcilable;
- a retry may finish an unverified account or observe that the account already became verified;
- token TTL still bounds the retained reconciliation window.

This preserves one-time/replay guarantees while removing the ambiguous `claim succeeded, response lost` outcome for email verification.

---

## 12. Delivery failure

Issuance persists before SMTP delivery.

If delivery fails:

- the newly issued token is invalidated;
- raw token is not logged;
- internal warning contains only a stable event name;
- public request remains bounded.

For registration/resend/recovery request endpoints, delivery failure does not become an account-existence oracle.

Operational monitoring must surface provider failure separately.

---

## 13. Enumeration resistance

Public request endpoints:

- verification resend;
- password recovery request;

return:

`202 { "accepted": true }`

without revealing:

- account existence;
- verification state;
- provider-delivery success.

Login may return `EMAIL_VERIFICATION_REQUIRED` only after correct password knowledge is proven.

Wrong password and unknown email remain `INVALID_CREDENTIALS`.

---

## 14. Inspect semantics

Inspect endpoints exist so clients can decide whether to render an action form.

Inspect:

- validates token shape;
- validates purpose;
- normally requires an unconsumed/non-expired token;
- for email verification only, may also resolve a non-expired token whose persisted consumption reason is `claimed`, so an interrupted completion can be reconciled;
- never accepts tokens consumed for invalidation/revocation/trimming;
- additionally validates current account state;
- does not consume;
- does not return token/account identity.

Success:

- HTTP 200 with a narrow `available: true` projection.

Unavailable:

- HTTP 410 with stable purpose-specific code.

Inspect is not a guarantee that a later completion will win a race.

Completion remains authoritative.

---

## 15. No-store and browser handling

Every Auth response uses:

`Cache-Control: no-store`.

Verification/recovery links contain bearer tokens because email clients need a portable action URL.

Frontend responsibilities:

- remove token from visible URL/history as early as practical;
- never send full action URL to analytics;
- never persist raw token in localStorage/sessionStorage/IndexedDB;
- POST the token to the API;
- avoid third-party resources on token-bearing pages before URL cleanup where feasible.

---

## 16. Delivery provider boundary

Auth depends on a narrow `AuthEmailDelivery` interface.

Messages:

- verification;
- recovery;
- recovery-completed security notification.

Provider SDK/configuration remains behind one adapter.

Production requires real delivery.

Local/test can use Mailpit or disabled delivery depending on test purpose.

Production startup fails if email delivery is disabled.

---

## 17. SMTP configuration

Production SMTP config requires:

- action base URL;
- sender identity;
- host;
- port;
- secure/TLS mode;
- username/password together when authentication is used.

Secrets stay in external environment/secret management.

Do not commit:

- SMTP password;
- provider API key;
- historical prototype Gmail app password;
- OAuth client secret.

---

## 18. Email action base URL

The action base URL must be an absolute HTTP(S) origin.

Current action routes:

- `/auth/verify-email`;
- `/auth/reset-password`.

The email adapter constructs URLs from the configured trusted base origin and fixed application paths.

The caller cannot choose arbitrary redirect/action hosts.

---

## 19. Logging and audit

Forbidden:

- raw action token;
- token hash;
- action URL containing token;
- password;
- SMTP credential.

Allowed bounded internal events:

- delivery failed;
- verification completed;
- recovery completed;
- action unavailable;
- account/session IDs only where internal audit policy permits.

Public diagnostics use requestId.

---

## 20. Persistence independence

Current implementation uses Mongo because the rescued backend still uses Mongo.

The security contract depends on capabilities, not Mongo-specific documents:

- unique random token identity;
- hash lookup;
- TTL/expiry;
- atomic single-token claim;
- bounded concurrent issuance;
- constant-read active-token retention;
- compare-and-swap account credential version;
- invalidate same-purpose tokens.

A future PostgreSQL or other persistence adapter must preserve these invariants.

---

## 21. Required tests

Unit/integration/runtime evidence must prove:

- raw bearer never persisted;
- purpose isolation;
- TTL;
- malformed token fails early;
- expired token unavailable;
- invalidated-token replay unavailable;
- claimed email-verification retry can reconcile a partial completion;
- claimed email-verification replay after committed success resolves success;
- concurrent same-token claim has one winner;
- active-token cap reads only the retained set;
- overflow cleanup removes all rows older than the retention cutoff;
- a concurrently newer row is not matched by overflow cleanup;
- verification is monotonic;
- remaining verification links collapse after success;
- recovery token carries credential version;
- recovery CAS has one password mutation winner;
- stale recovery link cannot change password;
- old sessions fail after credential-version increment;
- wrong password does not reveal verification state;
- request endpoints remain enumeration-resistant;
- SMTP provider failure does not leak account state;
- runtime email flow works through a real local SMTP sink;
- app logs do not expose raw action tokens.
