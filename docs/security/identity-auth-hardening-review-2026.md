# Identity/Auth v1 — Post-completion hardening review (2026)

Parent: #4  
Hardening lane: #52 / PR #53  
Production readiness: #48  
Native Mobile consumer: #49 / #7

## 1. Why this review exists

Identity/Auth v1 was closed as code-complete on `main @ 11d1ccd51138703aaf6a140c59927aa99723f309`.

That closure remains valid. This review does not reopen the product scope or merge Mobile/production work back into #4.

The purpose is narrower and stricter: before building Academic Catalog/Graph on top of Account identity, re-audit the authentication foundation as critical infrastructure and strengthen boundaries whose failure would affect every future Web, Mobile and backend feature.

The review follows four rules:

1. server identity/session authority stays shared across Web and Mobile;
2. security changes need negative/adversarial tests, not only happy-path tests;
3. repository evidence, browser evidence, native evidence and production evidence are different things;
4. external deployment gates remain visible instead of being simulated in application code.

## 2. Preserved strengths

The review intentionally preserves the existing architecture where it is already strong:

- one opaque, revocable AuthSession authority;
- 32-byte CSPRNG session bearer with hash-only persistence;
- Web host-only HttpOnly cookie and no browser bearer storage;
- Mobile bearer contract over the same server session authority;
- credentialVersion fencing for password change/recovery;
- live account-status revalidation;
- one-time hash-only verification/recovery action tokens;
- exact-origin CSRF protection;
- bounded/sanitized Auth audit events;
- Google OAuth state + nonce + PKCE boundaries;
- URL scrubbing for one-time Web action tokens;
- Mongo + Mailpit runtime smoke;
- exact-head CI, frozen lockfile and production dependency audit.

The goal is to make these guarantees harder to regress, not to replace them with a second authentication framework.

## 3. Password verifier hardening

### 3.1 Full-input verification

The rescued bcrypt path had an important legacy limitation: bcrypt implementations commonly only consider the first 72 input bytes.

New password material no longer uses bcrypt.

Current password hashes are versioned as:

`pbkdf2-sha256$<iterations>$<salt>$<digest>`

Current parameters:

- PBKDF2-HMAC-SHA-256;
- 600,000 iterations;
- random 16-byte salt;
- 32-byte derived key;
- timing-safe digest comparison;
- NFC-normalized full password input.

Legacy bcrypt is verification-only.

For a legacy bcrypt credential:

- submissions beyond 72 UTF-8 bytes fail closed instead of accepting a suffix-ambiguous credential;
- an eligible successful verification derives the current hash;
- replacement uses compare-and-swap against the exact old hash;
- rehash does not change credentialVersion because the user's actual credential did not change;
- rehash persistence failure is best-effort and does not convert a valid login into an outage.

A user whose historical bcrypt credential depends on input beyond the safe legacy boundary must recover/reset the password rather than silently inheriting truncation semantics.

### 3.2 Algorithm decision

OWASP prefers Argon2id for new password storage.

Node 24 also exposes a native Argon2 implementation, but the Node API is currently documented at release-candidate stability.

This hardening lane therefore keeps PBKDF2-HMAC-SHA-256/600k as the current dependency-free, stable runtime primitive instead of introducing a release-candidate crypto API or a new native addon without benchmarking.

This is a deliberate trade-off, not a claim that PBKDF2 is stronger than Argon2id.

Before long-term public production maturity, benchmark and re-evaluate Argon2id on the actual deployment runtime. Because the stored representation is versioned and login already supports opportunistic rehash, a future algorithm upgrade does not need to break the HTTP/session contract.

## 4. Password policy hardening

New passwords now use one server-authoritative policy across registration, authenticated change and recovery completion:

- minimum 15 Unicode code points;
- maximum 256 Unicode code points;
- NFC normalization;
- spaces allowed;
- Unicode allowed;
- paste/password managers allowed;
- no arbitrary upper/lower/number/symbol composition rule;
- stable `INVALID_PASSWORD` API code;
- Web copy/validation aligned with the server;
- local exact-match common/context blocklist baseline.

The local common/context list is only a baseline. It must not be described as a comprehensive breach corpus.

A broader common/expected/compromised-password source is still required before claiming complete NIST-style compromised-password screening.

## 5. Login enumeration/timing hardening

Login now avoids the obvious fast path for unknown/passwordless accounts by consuming the current verifier cost before returning `INVALID_CREDENTIALS`.

Account state is not exposed before credential proof:

- wrong password on an unverified account => `INVALID_CREDENTIALS`;
- wrong password on a restricted account => `INVALID_CREDENTIALS`;
- verification-required/restricted outcomes are only returned after the password is proven.

This reduces obvious account-state and timing oracles. It is not a substitute for production abuse/rate controls tracked in #48.

## 6. Session maturity

The existing 30-day absolute lifetime remains.

The hardening review adds server-side inactivity boundaries:

- Web idle timeout: 24 hours;
- Mobile idle timeout: 14 days;
- coarse lastSeen touch: at most every 5 minutes;
- idle boundary fails closed;
- an idle-expired presented token is revoked;
- inventory hides idle-expired sessions before TTL cleanup;
- client-type confusion continues to fail closed.

This preserves a usable native session while avoiding an effectively month-long dormant Web cookie.

No remember-me or unbounded sliding session exists.

### Residual concurrency boundary

TOP's PostgreSQL Auth lane uses serializable transactions for session-maintenance authority.

That idea is useful, but its implementation is persistence-specific.

Los Apuntes currently uses a replaceable Mongo adapter and the local runtime is not yet defined around a replica-set transaction topology. We therefore do not cargo-cult PostgreSQL transaction/retry code into Mongo.

The current guard revalidates session + live account + credentialVersion before protected controller execution. A future persistence decision should revisit cross-document atomicity for session-maintenance races where an acting session is revoked concurrently after authorization but before a second session mutation commits.

That residual race is documented rather than hidden.

## 7. Browser CSRF and transport hardening

Cookie-authenticated unsafe requests now require:

- SameSite=Lax host-only session cookie;
- exact `Origin === WEB_ORIGIN`;
- rejection of `Sec-Fetch-Site: cross-site` as defense in depth;
- fail-closed behavior for conflicting cookie + Authorization credentials.

Bearer-only Mobile requests do not depend on browser Fetch Metadata.

Tests cover trusted, untrusted, same-origin and cross-site cases.

## 8. HTTP/browser hardening

API responses now add stable defense-in-depth headers that the application itself can guarantee:

- `X-Content-Type-Options: nosniff`;
- `X-Frame-Options: DENY`;
- `Referrer-Policy: no-referrer`;
- restrictive camera/geolocation/microphone `Permissions-Policy`;
- `X-Permitted-Cross-Domain-Policies: none`;
- server-generated request ID.

HSTS is deliberately **not** asserted by the application hardening lane.

`Strict-Transport-Security` only has truthful security meaning when production HTTPS/ingress behavior is verified. That remains part of #48's deployment evidence.

Web document metadata is also corrected to the Los Apuntes product and Spanish language, with no-referrer behavior.

## 9. Web regression contract

The Web Auth path has a repository-level regression contract that checks:

- requests use credentials-inclusive cookie transport;
- Auth requests use no-store;
- bounded request timeout exists;
- no Auth bearer is persisted in localStorage/sessionStorage;
- no Authorization/Bearer path is introduced into normal Web Auth;
- fakeAuthApi does not return;
- email-verification/recovery pages remove one-time tokens from browser history immediately after parsing;
- current/new password autofill semantics remain correct;
- Web password policy stays aligned with server length semantics;
- document language/title/referrer metadata stays intentional.

This is useful static integration evidence, but it is **not** described as a real-browser end-to-end test.

A future browser E2E lane should exercise actual cookie behavior, history, navigation and accessibility against a running Web + API runtime.

## 10. TOP patterns adapted deliberately

Useful lessons taken from TOP include:

- malformed/oversized bearer validation before persistence lookup;
- stale-session negative testing;
- authority must be re-resolved from server state rather than cached in the client;
- session lifetime must have explicit invariants;
- forwarded-IP trust must not be enabled before proxy topology is verified;
- integration evidence should be separated from ordinary unit tests;
- races need explicit invariants instead of relying on happy-path sequencing.

Patterns not copied mechanically:

- PostgreSQL Serializable transaction/retry code is not transplanted into the current Mongo adapter;
- proxy-trust/IP throttling remains #48 because the deployed ingress topology is not yet authoritative;
- native SecureStore/bootstrap tests remain #49 because `apps/mobile` is not implemented yet.

## 11. Test evidence layers

Identity/Auth maturity is evaluated in layers.

### Unit/adversarial

Covers, among other cases:

- full-input password distinction beyond bcrypt's historical boundary;
- Unicode normalization;
- malformed/versioned hash parsing;
- legacy bcrypt migration and CAS race behavior;
- unknown-account verifier-cost path;
- wrong-password state non-disclosure;
- credential-version races;
- one-time action-token replay/concurrency;
- session transport confusion;
- Web/Mobile idle boundaries;
- CSRF Origin + Fetch Metadata;
- Google state/nonce/proof/link boundaries;
- audit secret exclusion.

### HTTP/controller

Covers:

- stable error codes;
- cookie flags;
- no raw Web session token;
- cookie clearing;
- session inventory/revocation;
- password lifecycle outcomes;
- runtime validation mapping.

### Container/runtime

Ephemeral Mongo + Mailpit evidence exercises real process boundaries for:

- registration;
- verification delivery/consume;
- Web and Mobile login;
- cookie and bearer session use;
- CSRF rejection;
- inventory/revocation;
- recovery;
- credential-version invalidation;
- password change;
- account restriction;
- security notification.

### Web static contract

Protects the shipped Web Auth integration against reintroducing the historical fake/bearer-storage model.

### Not yet repository-proven

Still separate by design:

- real browser E2E;
- native Mobile SecureStore/deep-link behavior (#49);
- real Google provider credentials/device flow (#48/#49);
- production SMTP/sender reputation (#48);
- production ingress/trusted proxy/rate limiting/HSTS (#48);
- final Terms/Privacy/support/observability (#48).

## 12. Coverage policy

The project requirement calls for at least 80% coverage in critical modules.

This review measures the critical Identity/Auth core separately instead of hiding it inside repository-wide averages.

The critical set includes password, session, lifecycle, guards, action tokens and Google identity orchestration.

Measured hardening evidence before the permanent gate was frozen:

- 192 tests passed;
- statements: 94.18% (551/585);
- branches: 80.41% (156/194);
- functions: 100% (85/85);
- lines: 93.75% (510/544).

The permanent `Auth critical coverage` CI job now enforces a regression floor of:

- statements >= 90%;
- branches >= 80%;
- functions >= 95%;
- lines >= 90%.

This is intentionally stricter than a repository-wide average: future code in the selected security-authority files must arrive with enough tests to preserve those floors.

## 13. Remaining maturity decisions

The following are intentionally visible, not silently declared complete:

1. **Broad password blocklist** — local baseline exists, but a larger common/compromised source and operational update strategy is still needed.
2. **Argon2id** — preferred long-term KDF candidate; benchmark against production runtime before changing the current versioned scheme.
3. **Browser E2E** — static Web contract is not a substitute for Playwright/real-browser cookie/history tests.
4. **Session-maintenance atomicity** — revisit with the final persistence/topology decision instead of introducing fake cross-document guarantees.
5. **Rate limiting / trusted client IP** — production edge problem tracked in #48; do not trust arbitrary forwarding headers.
6. **MFA/passkeys** — outside v1, but should remain on the future account-security roadmap.
7. **Mobile native proof** — #49 remains required; backend Mobile endpoints alone do not make Mobile Auth complete.

## 14. Closure rule for this hardening pass

#52 / PR #53 may close only when:

- hardening code and documentation agree;
- temporary probes/workflows are removed;
- critical Auth coverage has a real measured gate;
- repository Quality Gate passes at exact head;
- production dependency audit passes at exact head;
- Mongo + Mailpit container runtime smoke passes at exact head;
- PR review threads are resolved;
- #48 and #49 remain open with no production/native evidence falsely absorbed into this lane.

Only then should Academic Catalog/Graph proceed on top of the hardened identity foundation.

## References

- NIST SP 800-63B-4, Password Authenticators: https://pages.nist.gov/800-63-4/sp800-63b.html
- OWASP Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP Session Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- Node.js v24 Crypto, Argon2 API status: https://nodejs.org/download/release/v24.16.0/docs/api/crypto.html
