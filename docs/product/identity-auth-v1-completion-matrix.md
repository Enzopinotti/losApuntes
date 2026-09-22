# Identity/Auth v1 — Completion matrix and handoff

## Purpose

This document closes the **code-complete Identity/Auth v1** implementation without pretending that every deployment or native-client prerequisite is already complete.

Identity/Auth has four different completion states:

- **Implemented** — backend/client code exists and passes repository evidence.
- **User-complete** — the intended user can complete the journey in that client.
- **Launch-ready** — real production/provider/legal/edge prerequisites are proven.
- **Deferred** — intentionally outside Identity/Auth v1 and tracked elsewhere.

These states must not be collapsed into one green checkbox.

## Current baseline

Code-complete baseline:

`main @ 85a99ac3dbe959d13bc6b1562ffe5f6dc582c79c`

Merged implementation lanes:

- #39 / PR #44 — opaque revocable sessions;
- #40 / PR #45 — email verification + password recovery;
- #41 / PR #46 — account security + password change + account status;
- #42 / PR #47 — Google identity + real Web integration.

Remaining explicit gates:

- #48 — production launch readiness;
- #49 — real native/mobile Auth client.

## Acceptance matrix

| Capability | Backend | Web | Mobile | Launch gate | Status / owner |
| --- | --- | --- | --- | --- | --- |
| Account creation | Implemented | User-complete | Contract exists | Real Terms/Privacy + provider config | Web complete; Mobile #49; launch #48 |
| Password login | Implemented | User-complete | Native endpoint exists | Edge abuse controls | Web complete; Mobile #49; launch #48 |
| Email verification | Implemented | User-complete | Native/deep-link UI pending | Real transactional provider/domain | Web complete; Mobile #49; launch #48 |
| Verification resend/cooldown | Implemented | User-complete | Pending native UI | Real provider evidence | Mobile #49; launch #48 |
| Password recovery request | Implemented | User-complete | Pending native UI | Real provider evidence | Mobile #49; launch #48 |
| Password recovery completion | Implemented | User-complete | Pending native UI | Universal/app links + provider evidence | Mobile #49; launch #48 |
| Web session | Implemented | User-complete | N/A | HTTPS/cookie ingress smoke | Launch #48 |
| Mobile session | Implemented | N/A | Client not implemented | SecureStore/native runtime | #49 |
| /auth/me bootstrap | Implemented | User-complete | Client restore pending | Production ingress | #49 / #48 |
| Logout current session | Implemented | User-complete | Client pending | Production ingress | #49 / #48 |
| Session inventory | Implemented | User-complete | Native UI pending | None beyond ordinary release gate | #49 |
| Revoke one session | Implemented | User-complete | Native UI pending | None beyond ordinary release gate | #49 |
| Revoke all sessions | Implemented | User-complete | Native UI pending | None beyond ordinary release gate | #49 |
| Authenticated password change | Implemented | User-complete | Native UI pending | Real email/security notification provider | #49 / #48 |
| Credential-version fencing | Implemented | Transparent to user | Transparent to user | Runtime evidence already present | Complete |
| Restricted account enforcement | Implemented | User-complete state | Native state pending | Operational restriction source/tooling later | #49 |
| Google Web sign-in | Implemented | User-complete when enabled | N/A | Fresh OAuth client + consent + HTTPS callback | #48 |
| Google Mobile sign-in | Implemented server contract | N/A | Native provider flow pending | Native OAuth client IDs + device smoke | #49 / #48 |
| Google link/unlink | Implemented | User-complete | Native UI pending | Provider-enabled smoke | #49 / #48 |
| No browser bearer storage | Implemented | Enforced + hygiene guard | N/A | Production browser smoke | #48 |
| Secure mobile bearer storage | Server contract only | N/A | Not implemented | Real SecureStore build | #49 |
| CSRF/origin defense | Implemented | User-transparent | N/A | Exact production origin/HTTPS smoke | #48 |
| Transactional email abstraction | Implemented | Journeys consume it | Journeys can consume it | Real provider + sender auth | #48 |
| Auth audit boundary | Implemented | User-transparent | User-transparent | Retention/observability review | #48 |
| Abuse/rate-limit UX code | Stable contract exists | Error state documented | Must consume code | Trusted edge/proxy policy not deployed | #48 |
| Terms/Privacy links | Product contract documented | Needs final legal URLs/content | Needs final legal URLs/content | Legal/product decision | #48 |
| Email change | Designed only | Not shipped | Not shipped | Requires reauth + mailbox verification policy | Deferred / #48 until implementation issue |
| Account closure/deletion | Boundary documented | Not shipped | Not shipped | Requires domain/data-retention decision | Deferred / #48 then dedicated implementation |
| MFA/passkeys | Not in v1 | Not in v1 | Not in v1 | Future security roadmap | Deferred |
| User-visible security history | Audit sink exists | No persistent history UI | No persistent history UI | Retention/privacy decision | Deferred |

## What is genuinely complete

### Server identity authority

The backend now has one coherent identity authority:

- opaque random AuthSession;
- hash-only session persistence;
- session revocation;
- Web cookie and Mobile bearer transports over the same session model;
- credential-version fencing;
- explicit account status;
- verification/recovery one-time action tokens;
- password change/recovery invalidating stale sessions;
- external Google identity separated from Account;
- bounded Auth audit events.

JWT/role claims are no longer the session authority.

### Web

The historical fake/localStorage Auth path is gone.

Web now has:

- real registration;
- login;
- verification pending/resend/complete;
- forgot/reset password;
- server-authoritative session restore;
- async logout;
- protected-route restoring/unavailable states;
- restricted-account state;
- Google status/start/callback UX;
- Account > Security;
- session list/revoke one/revoke all;
- password change;
- Google link/unlink.

Browser JavaScript does not hold the session bearer.

### Runtime evidence

Repository CI has already proven real-process behavior against ephemeral Mongo + Mailpit:

- health/readiness;
- account creation;
- verification-gated login;
- verification delivery and one-time consumption;
- Web session cookie;
- CSRF rejection;
- Mobile bearer issuance;
- session inventory;
- password recovery;
- credential-version fencing;
- password change;
- account restriction;
- Google fake-provider contract paths where provider-independent behavior can be tested.

This is code/runtime evidence, not a substitute for real provider/deployment evidence.

## What is not complete yet

### Native Mobile product

`apps/mobile` still has no real native implementation.

The backend supports Mobile, but a person cannot yet use the native product.

Tracked in #49 under #7.

Required before Mobile Auth is user-complete:

- framework/native foundation selected;
- SecureStore/Keychain/Keystore credential storage;
- auth bootstrap;
- native register/login/logout;
- verification/recovery deep links;
- security settings;
- restricted/offline/timeout states;
- Google native provider flow;
- generation fencing;
- real-device/simulator tests.

### Production launch readiness

Repository CI cannot prove:

- production SMTP/provider credentials;
- SPF/DKIM/DMARC or equivalent sender setup;
- Google production OAuth configuration;
- real HTTPS/cookie behavior through production ingress;
- authoritative proxy topology;
- edge/application abuse controls;
- legal Terms/Privacy;
- support runbook;
- deployed secret rotation;
- real alerting/metrics.

Tracked in #48.

## Deliberate domain handoff

Identity/Auth must not grow until it owns all user/account data.

After successful verified authentication, product onboarding belongs to:

- #10 Academic Catalog;
- #5 Academic Graph;
- #9 Profile;
- #7 Mobile client.

Auth does **not** own:

- university;
- career/program;
- current subjects;
- alumni state;
- organization membership;
- profile customization;
- resource permissions.

The current Account can be valid before academic onboarding is complete.

## Account closure and email change

These are intentionally not half-implemented.

### Email change

Future implementation must include:

1. authenticated session;
2. reauthentication;
3. pending new email;
4. proof of new mailbox;
5. notification to old mailbox;
6. collision/concurrency handling;
7. canonical swap;
8. session-revocation policy.

### Account closure/deletion

Auth cannot decide this alone.

The future contract must first resolve:

- Resource authorship;
- Q&A/posts;
- organization ownership/management;
- alumni/history;
- moderation evidence;
- audit retention;
- legal retention;
- anonymization vs tombstone vs physical delete;
- grace/recovery period.

The UI must eventually expose a normal closure path; support-only deletion is not the desired steady state.

## User experience coverage

For every shipped Auth journey, clients must preserve these distinct states:

- idle;
- loading/submitting;
- success;
- field validation error;
- invalid credentials;
- verification required;
- one-time link unavailable/expired;
- restricted account;
- session expired/revoked;
- offline;
- timeout;
- server unavailable;
- rate limited;
- provider unavailable;
- unexpected sanitized error.

Network failure must never be silently reclassified as logout.

Error branching uses stable API codes, not localized message text.

## Accessibility baseline

Auth UI must continue to preserve:

- semantic labels;
- visible focus;
- screen-reader associated errors;
- live form-level feedback;
- keyboard navigation;
- password-manager/autofill support;
- paste support;
- accessible show/hide password state;
- touch-target sizing;
- no color-only error meaning;
- no secret-bearing URL persistence longer than needed.

Mobile #49 inherits the same requirements through native equivalents.

## Privacy baseline

Identity/Auth v1 deliberately avoids collecting/displaying:

- precise user location;
- raw IP history in user session UI;
- full User-Agent;
- browser/device fingerprint;
- hardware identifiers;
- contacts;
- academic data during credential creation.

Secrets never belong in:

- logs;
- analytics;
- URLs after one-time-token parsing;
- browser storage;
- crash reports;
- user-facing session metadata.

## Closure rule for #4

#4 is **code-complete** when:

- #39–#42 are merged;
- post-merge `main` is green;
- fake Web auth is gone;
- all implemented Auth journeys have stable contracts and user documentation;
- remaining Mobile work is explicitly tracked in #49;
- remaining deployment/public-launch work is explicitly tracked in #48.

Closing #4 does **not** mean:

- Mobile is complete;
- public production launch is approved;
- account deletion/email change are shipped;
- MFA/passkeys are shipped;
- Academic Onboarding/Profile are shipped.

## Handoff checklist

Before starting the next product domain:

- use `GET /auth/me` only for identity/session bootstrap;
- do not add `career_id` back to Auth;
- do not put academic roles into session bearer;
- do not store Web bearer state in JS;
- do not create a second Mobile auth provider;
- keep #48 open through pilot/production readiness;
- keep #49 open until a real native build completes Auth journeys.

This separation is intentional: **Identity/Auth v1 is code-complete, while Mobile product completion and production launch readiness remain explicit, visible work.**
