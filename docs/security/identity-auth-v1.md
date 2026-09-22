# Identity/Auth v1 — Security and session contract

Parent: #4  
Session core: #39  
Verification/recovery: #40  
Account security: #41  
OAuth/client integration: #42

## Status

This document is the security contract for Los Apuntes Identity/Auth v1.

It intentionally defines one identity/session authority shared by Web and Mobile without choosing the final Academic Graph persistence.

The current JWT implementation is legacy and must not remain the authorization authority after this contract lands.

---

## 1. Authority model

### Account principal

Auth resolves one Account/User principal.

The principal owns:

- login methods;
- credential state;
- email verification state;
- account status;
- sessions;
- security lifecycle.

It does not own:

- university membership;
- organization management authority;
- academic role;
- Profile visibility;
- Resource access merely by identity.

Those are resolved by their owning domains.

### Server authority

Clients may present credentials. Clients never present authoritative:

- userId;
- role;
- verification status;
- account status;
- academic affiliation;
- session ownership.

All of those are resolved server-side.

---

## 2. Auth session model

### Opaque bearer

Each successful login creates one cryptographically random opaque session token.

Recommended v1 token:

- 32 random bytes from a cryptographically secure RNG;
- base64url encoded;
- never structured;
- no user/account claims embedded.

The server persists only a one-way SHA-256 digest of the raw token.

The raw token exists only:

- in the Web HttpOnly cookie; or
- in Mobile SecureStore/equivalent;
- transiently in server memory during issuance/validation.

It must not be persisted in logs, analytics, database fields, error metadata or documentation examples.

### Why opaque sessions

Los Apuntes needs:

- immediate revocation;
- session inventory;
- revoke-one/revoke-all;
- password-change revoke-all;
- future account restriction invalidation;
- one backend authority for Web/Mobile.

Opaque server sessions satisfy these requirements directly without access/refresh JWT rotation complexity.

### Session conceptual fields

Physical schema remains adapter-specific, but the domain needs:

- session identifier;
- account/user identifier;
- token hash;
- client type: web or mobile;
- createdAt;
- expiresAt;
- coarse lastSeenAt if maintained;
- revocation state or deletion semantics;
- optional security metadata only when privacy review approves it.

No role, academic affiliation or Profile snapshot belongs inside AuthSession.

### Expiration policy

Implemented v1 policy:

- absolute session lifetime: 30 days for every client;
- Web idle timeout: 24 hours;
- Mobile idle timeout: 14 days;
- lastSeenAt is touched coarsely, no more often than every 5 minutes;
- reaching the idle boundary invalidates the presented session server-side;
- session inventory hides sessions that are already idle-expired even before TTL cleanup;
- no implicit infinite rolling session and no remember-me mode.

The longer Mobile idle window is a product/usability trade-off, not weaker authority: Mobile still uses the same server-side session record, credentialVersion fence, account-status check and explicit revocation model.

---

## 3. Web transport

### Cookie

Production Web session cookie:

- HttpOnly;
- Secure;
- Path=/;
- host-only;
- SameSite=Lax;
- no Domain attribute.

Preferred production name:

`__Host-losapuntes_session`

Development may use a non-`__Host-` name if local HTTP tooling requires it.

### Why SameSite=Lax

Lax blocks common cross-site state-changing form submission while preserving normal top-level navigation from email/search/external links.

Unsafe cookie-auth operations still require an explicit CSRF/origin defense.

### No browser token exposure

Web login must not return the raw session token in JSON.

Browser JavaScript must not store auth bearer material in:

- localStorage;
- sessionStorage;
- IndexedDB;
- Redux persistence;
- URL/query/hash;
- visible cookies.

---

## 4. Mobile transport

Mobile uses the **same AuthSession authority**, not a second auth provider.

A native login flow may return the raw opaque session token in its authenticated response.

Requirements:

- store only in SecureStore/Keychain/Keystore equivalent;
- present through `Authorization: Bearer <token>`;
- clear locally on logout even if server revoke cannot be reached;
- never place token in AsyncStorage or ordinary app state persistence;
- avoid copying token into crash reports/analytics.

The endpoint/transport that returns a Mobile token must never be used by Web.

This is a client contract and reduces exposure; it is not treated as a cryptographic proof that a request came from a genuine native binary. Future app attestation is separate.

---

## 5. Credential resolution

For an authenticated request, Auth resolves at most one session credential.

Rules:

1. if a valid Bearer header is used on a Mobile-compatible endpoint, resolve it as native session credential;
2. otherwise resolve the configured Web cookie where cookie auth is accepted;
3. conflicting simultaneous credentials fail closed rather than choosing unpredictably;
4. invalid, expired or revoked session => unauthenticated;
5. account status is revalidated from server state before granting authenticated product authority.

Do not cache role/profile/affiliation authority inside the session token.

---

## 6. CSRF contract

Cookie-authenticated unsafe requests require CSRF protection.

V1 defense:

- SameSite=Lax host-only cookie;
- exact configured Web origin;
- unsafe methods using cookie auth must validate `Origin` against trusted `WEB_ORIGIN`;
- `Sec-Fetch-Site: cross-site` fails closed as browser defense-in-depth even if a forged Origin appears trusted;
- Bearer-only native requests do not depend on browser Fetch Metadata;
- if the runtime topology later introduces additional legitimate origins, each must be explicitly configured/reviewed;
- arbitrary forwarded headers are not trusted.

Unsafe methods:

- POST;
- PUT;
- PATCH;
- DELETE.

GET/HEAD remain non-mutating by contract.

Mobile Bearer requests are not subject to browser CSRF but remain subject to authentication/authorization.

If production routing changes to a cross-site topology, this contract must be revisited before deployment.

---

## 7. Password contract

### Creation policy

One shared policy for:

- registration;
- password change;
- recovery completion.

Implemented v1 policy:

- minimum 15 Unicode code points for a standalone password factor;
- maximum 256 Unicode code points;
- NFC normalization before derivation for the current scheme;
- no required upper/lower/number/symbol composition;
- spaces and Unicode allowed;
- paste allowed;
- password-manager/autofill compatible;
- exact-match rejection for a local common/context password baseline.

The local baseline is intentionally not described as a complete compromised-password corpus. A broader blocklist/reputation source remains a maturity requirement before claiming full NIST-style compromised-password screening.

### Hashing

New passwords use a versioned PBKDF2-HMAC-SHA-256 representation with:

- 600,000 iterations;
- 16-byte random salt;
- 32-byte derived key;
- timing-safe digest comparison;
- the full NFC-normalized password input.

Legacy bcrypt remains verification-only during migration:

- legacy inputs beyond bcrypt's 72-byte boundary fail closed rather than silently accepting an ambiguous truncated credential;
- an eligible successful legacy login derives the current hash and replaces the old hash with compare-and-swap semantics;
- password rehash does not change credentialVersion because the user credential itself did not change;
- a failed best-effort rehash must not break an otherwise valid login.

PBKDF2 was selected here as a dependency-free, stable Node runtime primitive while Node's built-in Argon2 API is still release-candidate stability. OWASP prefers Argon2id for new password storage when available and operationally mature, so Argon2id remains an explicit benchmark/upgrade candidate rather than being falsely described as unnecessary.

Do not encode password algorithm choice into the public API.

### Password comparison

Unknown/passwordless accounts consume the current verifier cost before returning invalid credentials so the obvious fast-path account timing oracle is reduced.

Wrong-password results do not reveal whether an account is unverified or restricted. Verification-required/restricted states are returned only after credential proof.

Public login error remains `INVALID_CREDENTIALS` for unproven credentials.

---

## 8. Registration

Public registration must not create an easy account-existence oracle.

Conceptual input:

- email;
- password;
- required Terms/Privacy acceptance version where applicable.

Display name belongs to onboarding/Profile unless a product decision later chooses to collect it earlier.

Server:

- normalize/validate email;
- validate password policy;
- create or continue an unverified account flow;
- issue verification token where appropriate;
- return a bounded public result.

Registration does not create a normal authenticated session before verification.

---

## 9. Email verification token

Token requirements:

- 32 cryptographically random bytes;
- base64url;
- SHA-256 hash persisted;
- one-time;
- recommended TTL: 24 hours;
- bound to the intended account/email claim;
- resend rotates/revokes previous pending token when appropriate;
- atomic consume prevents replay.

Raw token must never appear in:

- logs;
- database;
- analytics;
- error context.

Verification token is not an AuthSession.

---

## 10. Password recovery token

Token requirements:

- 32 cryptographically random bytes;
- base64url;
- hash-only persistence;
- one-time;
- recommended TTL: 30 minutes;
- atomic anti-replay consume;
- previous pending recovery may be rotated/revoked.

Recovery request is enumeration-resistant.

Recovery completion:

1. validate/claim token;
2. validate new password;
3. derive replacement hash;
4. atomically commit credential update + token consumption + revoke-all sessions where the storage model supports one transaction;
5. otherwise use an explicitly safe compare-and-swap/compensation contract;
6. do not auto-login.

The persistence ADR will determine the physical transaction mechanism; the security outcome is not negotiable.

---

## 11. Session revocation

### Current session logout

Idempotent.

Revoking an already-invalid credential does not reveal internal state.

### Targeted revoke

Authenticated account may target a session ID.

Server applies ownership predicate from the current authenticated principal.

Unknown and another user's session ID produce the same safe outcome.

### Revoke all

Invalidates every active session for the current account.

Used by:

- explicit security settings action;
- successful password change;
- successful password recovery;
- compromise/restriction policy when required.

---

## 12. Session inventory

User-facing inventory returns active/non-expired sessions only.

Safe fields:

- id;
- clientType;
- createdAt;
- lastSeenAt when available;
- expiresAt;
- current.

V1 does not need to store or expose:

- raw IP history;
- precise location;
- full User-Agent;
- canvas/browser fingerprint;
- hardware identifiers.

Those require a separate privacy/security decision.

---

## 13. Account status

At minimum Auth must be able to distinguish:

- pending verification;
- active;
- restricted/suspended;
- closure/deletion lifecycle when implemented.

Account status is server-derived and rechecked during session bootstrap/authorization.

A session token cannot keep an account active after the account becomes restricted if policy requires access removal.

---

## 14. Reauthentication

Sensitive changes should require recent authority.

V1:

- password change requires current password for password-backed account;
- future email change requires reauthentication;
- future OAuth link/unlink requires reauthentication;
- destructive account closure requires reauthentication.

A generic “session exists” check is not sufficient for every sensitive mutation.

---

## 15. Email/provider abstraction

Auth owns token/account lifecycle, not SMTP/provider credentials.

Introduce a narrow delivery boundary for transactional messages.

Conceptual commands:

- send email verification;
- send password recovery;
- send security notification.

Provider implementation may be email-service specific later.

Rules:

- provider failure never logs raw token/link;
- retries preserve one logical issuance;
- Auth does not import provider SDKs throughout domain services;
- no historical prototype SMTP secret is reused.

A real transactional email provider is a launch blocker for verification/recovery to be user-complete.

---

## 16. Google OAuth

Google OAuth authenticates a provider identity and then issues a normal Los Apuntes AuthSession.

Security requirements:

- state validation;
- PKCE where supported/appropriate;
- exact redirect URI allow-list;
- verified-email claim required before using provider email as verified;
- provider access/refresh tokens never become app sessions;
- provider tokens are not stored unless a future Google API feature actually needs them;
- account linking is explicit;
- callback errors are bounded/sanitized;
- Mobile deep-link return is allow-listed.

OAuth must not bypass account restriction or session policy.

---

## 17. Error contract

Stable codes are machine-readable; user-facing text can localize independently.

Core candidates:

- `INVALID_CREDENTIALS`
- `EMAIL_VERIFICATION_REQUIRED`
- `AUTHENTICATION_REQUIRED`
- `ACCOUNT_RESTRICTED`
- `INVALID_PASSWORD`
- `INVALID_CURRENT_PASSWORD`
- `PASSWORD_CHANGE_CONFLICT`
- `VERIFICATION_NOT_AVAILABLE`
- `RECOVERY_NOT_AVAILABLE`
- `RATE_LIMITED`
- `BAD_REQUEST`

Rules:

- no raw database/provider errors;
- no token existence oracle beyond possession of the narrow token itself;
- no distinction between unknown vs other-user session target;
- requestId remains available for diagnostics;
- Auth responses use `Cache-Control: no-store`.

---

## 18. Audit contract

Sensitive Auth actions emit sanitized audit facts.

Candidate event vocabulary:

- `auth.account.created`
- `auth.email.verification.requested`
- `auth.email.verified`
- `auth.login.succeeded`
- `auth.login.failed`
- `auth.session.created`
- `auth.session.revoked`
- `auth.session.revoked_all`
- `auth.password.changed`
- `auth.password.recovery.requested`
- `auth.password.recovery.completed`
- `auth.oauth.linked`
- `auth.oauth.unlinked`
- `auth.account.restricted`

Audit payloads must never contain passwords, raw tokens, token hashes, cookies or OAuth secrets.

Failed-login audit must avoid becoming a database of raw attempted addresses when that is unnecessary. Exact retention and privacy policy must be explicit before long-term storage.

---

## 19. Login abuse controls

The production proxy topology is not yet authoritative, so v1 must not pretend arbitrary `X-Forwarded-For` is a trustworthy client identity.

Do not implement a hard email/account lockout that an attacker can trivially use to deny access to a victim.

Before production launch, abuse protection must combine reviewed controls such as:

- trusted edge/proxy rate limits;
- bounded global/login endpoint limits;
- account-aware progressive delay that does not create indefinite targeted lockout;
- provider/WAF controls where applicable;
- alerting on anomalous failure volume.

Until trusted proxy topology is known, Auth should keep stable `RATE_LIMITED` semantics documented but avoid unsafe IP authority.

This is a launch/security requirement, not permission to ship infinite brute-force attempts.

---

## 20. Concurrency/race invariants

Tests must prove applicable races:

### Registration

Concurrent same-email registration cannot create multiple canonical accounts.

### Verification

Two consumers of one verification token cannot both succeed.

### Recovery

Two consumers of one recovery token cannot both change the password.

### Password change

Concurrent password changes cannot overwrite a newer credential with a stale verified password.

### Session revoke

Revocation racing with request/bootstrap fails closed once revocation is authoritative.

### Revoke-all

No active session survives a successful password change/recovery if policy requires revoke-all.

---

## 21. Cache and browser handling

Sensitive Auth endpoints return:

`Cache-Control: no-store`

Do not place bearer tokens in:

- URLs;
- redirect query strings back to API;
- page titles;
- analytics events;
- browser history;
- logs.

Frontend verification/recovery routes should remove one-time tokens from visible URL/history immediately after parsing when feasible.

---

## 22. Security logging

Allowed diagnostic dimensions:

- requestId/correlationId;
- stable error code;
- operation name;
- server-derived account/session IDs where internal logging policy permits;
- duration/status.

Forbidden generic logging:

- request body;
- password;
- session token;
- cookie;
- verification token;
- recovery token;
- provider token;
- secret/config value.

Global redaction is defense in depth, not permission to log secrets.

---

## 23. Client race/fencing rules

Web/Mobile auth state must be generation-fenced.

Examples:

- a stale `/auth/me` response cannot overwrite a newer logout;
- an old login response cannot replace a newer account switch/logout;
- session-expiry handling cannot erase a freshly established session;
- Mobile SecureStore restore must be fenced against concurrent login/logout.

“Latest relevant auth operation wins.”

---

## 24. Launch-blocking security checklist

Identity/Auth cannot be considered launch-ready until:

- Web bearer never reaches JS;
- Mobile credential is SecureStore-backed;
- revocation is server-side and proven;
- verification/recovery are one-time and hash-only;
- password recovery revokes sessions;
- password policy is shared;
- account enumeration is bounded;
- CSRF defense is active for cookie-auth unsafe requests;
- transactional email delivery is real;
- trusted proxy/rate-limiting policy is deployed;
- OAuth credentials are fresh and redirect URIs constrained;
- sensitive logs are redacted by design;
- negative/race tests exist;
- exact-head CI and runtime smoke are green.
