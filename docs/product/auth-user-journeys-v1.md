# Identity/Auth v1 — User journeys and account experience

Parent: #4  
Contract issue: #38

## Purpose

Identity/Auth is the first real product boundary a person experiences in Los Apuntes. It must feel trustworthy, simple and personal without hiding security state.

This document defines the **user-facing behavior**. It does not choose a database or UI component library.

The same identity contract serves Web and Mobile. Web and Mobile may differ in transport and interaction details, but they must not invent different account semantics.

---

## 1. Product principles

### 1.1 Minimum friction, explicit state

The user should always understand whether they are:

- browsing anonymously;
- creating an account;
- waiting for email verification;
- authenticated;
- authenticated but temporarily blocked from a sensitive action;
- recovering access;
- signed out because the session expired or was revoked.

Do not collapse these states into generic “something went wrong”.

### 1.2 Security is part of the product experience

Security controls should explain why they exist and what the user can do next.

Examples:

- “Tu sesión venció. Iniciá sesión de nuevo para continuar.”
- “Verificá tu email para activar la cuenta.”
- “Este enlace ya fue usado o venció. Podés pedir uno nuevo.”
- “Cambiamos tu contraseña y cerramos tus otras sesiones.”

Avoid implementation text such as JWT, cookie, hash, database or provider errors.

### 1.3 No dark patterns

- No forced “remember me” default.
- No manipulative countdowns.
- No hidden unsubscribe/close-account controls.
- No fake urgency in verification/recovery mail.
- No user-hostile password composition rules.
- No infinite retry loops after auth failure.

### 1.4 Identity is not academic onboarding

Registration establishes an account. Academic onboarding establishes context.

Do not require university, career, subject or profile richness just to create credentials.

After first verified login, hand off to academic onboarding.

---

## 2. Primary account states

### Anonymous

The user has no authenticated session.

Allowed:

- public landing surfaces;
- public resources/profile snippets where product policy allows;
- login/register/recovery;
- OAuth start.

Not allowed:

- private resources;
- account settings;
- authenticated contribution;
- private profile data.

### Registered but email unverified

The account exists but email ownership has not been proven.

Allowed:

- resend verification;
- inspect/complete verification token;
- restart registration safely;
- login credential check may identify that verification is required **only after password knowledge is proven**.

Not allowed:

- full authenticated product access;
- academic contribution;
- security settings requiring a normal session.

### Verified active

Normal authenticated state.

May:

- enter onboarding/home;
- use allowed account/profile/product capabilities;
- manage own active sessions;
- change password;
- request future email change/account closure.

### Restricted/suspended

The account remains a known identity but normal product actions are bounded by policy.

The system must distinguish:

- authentication failure;
- account restriction;
- product-content moderation.

Restriction semantics and appeal UX belong to moderation/account policy; Auth must not masquerade a restricted account as invalid credentials when the user has successfully authenticated unless hiding the state is intentionally required.

### Closed/deletion-pending

Final deletion/anonymization semantics depend on the data-retention contract.

The product must nevertheless plan a visible account closure surface before launch. Do not make “contact support” the only ordinary deletion path unless legal/operational requirements force it.

---

## 3. Registration journey

### Entry

Web/Mobile surfaces:

- email;
- password;
- Continue with Google;
- Terms/Privacy acknowledgement;
- link to login.

Academic data is not requested here.

### Password UX

Recommended UX:

- one password field plus show/hide toggle;
- password managers/autofill allowed;
- copy/paste allowed;
- Unicode/spaces allowed;
- no arbitrary uppercase/number/symbol checklist;
- show minimum length before submit;
- API remains authority.

Proposed v1 policy:

- minimum 12 characters;
- maximum 256 characters.

The exact policy is shared by registration, password change and recovery.

### Submit result

Public registration should avoid becoming a reliable account-existence oracle.

The preferred public outcome is a bounded success state such as:

> “Si podemos crear o continuar esa cuenta, te enviamos instrucciones al email.”

Server behavior can differ internally for:

- new email;
- existing unverified account;
- existing verified account.

The public response must not reveal internal account state without a user proving additional authority.

### Verification screen

Immediately after registration:

- show the email entered, partially masked when appropriate;
- explain that verification activates the account;
- “Reenviar email” with cooldown;
- “Usar otro email” returns to a safe registration correction flow;
- allow going to login;
- do not trap the user in a full-screen dead end.

### Verification mail requirements

Mail should contain:

- recognizable Los Apuntes branding;
- purpose of the email;
- expiration indication;
- one clear CTA;
- plain fallback link;
- warning if the user did not request it;
- no password/token/debug information;
- no sensitive profile details.

---

## 4. Email verification journey

The browser/app receives a one-time verification token through a frontend route/deep link.

Rules:

- the API does not accept the token in query parameters;
- the client removes the token from the visible URL/history as early as feasible;
- token is submitted in a POST body;
- verification responses are no-store;
- token is one-time and expires.

### Success

Show:

> “Email verificado.”

Then offer “Iniciar sesión”.

V1 does not need to turn email verification into an implicit long-lived login. Keeping verification and session issuance separate reduces bearer-token meaning and cross-device surprises.

### Invalid/expired/already-used

Do not dump provider/server text.

Show one safe state:

> “Este enlace ya no está disponible.”

Actions:

- request a new verification email;
- go to login;
- change registration email where supported.

### Resend

Resend must:

- use cooldown/bounded frequency;
- rotate/revoke the previous pending token when appropriate;
- not create duplicate accounts;
- not leak whether another user already owns the email.

---

## 5. Login journey

### Form

- email;
- password;
- show/hide password;
- Continue with Google;
- “Olvidé mi contraseña”;
- link to register.

### Invalid credentials

Public response:

> “Email o contraseña incorrectos.”

Do not distinguish “email not found” vs “wrong password”.

### Correct credentials but unverified email

Because the caller has proven password knowledge, the product may safely return a distinct state:

> “Verificá tu email para continuar.”

Offer resend.

### Successful login

Server creates one revocable AuthSession.

Web:

- session token is delivered only as HttpOnly cookie;
- browser JavaScript never stores the bearer session token.

Mobile:

- native login receives an opaque bearer session credential;
- the app stores it only in SecureStore/equivalent;
- no AsyncStorage/localStorage equivalent for auth secrets.

Both then call/bootstrap the same authenticated identity contract.

### Post-login destination

If academic onboarding is incomplete:

- route to onboarding.

If onboarding is complete:

- route to Home/current academic context.

A return-to destination may be honored only if it is a safe internal destination.

---

## 6. Session bootstrap and app startup

Clients use one canonical “who am I?” bootstrap.

The response must be sufficient to decide:

- authenticated vs unauthenticated;
- account status;
- email verification state;
- minimum display identity;
- whether onboarding is required;
- current session metadata needed by settings;
- next safe product state.

The bootstrap does **not** need to embed the full Profile or full Academic Graph.

### Startup states clients must distinguish

- restoring;
- authenticated;
- unauthenticated;
- expired/revoked;
- restricted;
- network unavailable;
- server unavailable;
- malformed/unexpected response.

A network timeout is not the same as logged out.

Clients must not erase remembered non-secret presentation state merely because one bootstrap request temporarily failed.

---

## 7. Logout

### Logout this session

Always safe and idempotent.

Web:

- revoke server session if present;
- clear cookie even when server token is already invalid.

Mobile:

- revoke server session when possible;
- clear SecureStore credential locally even if network revoke fails;
- if revoke cannot reach the server, surface that the local device is signed out while the server session may remain until expiry/revocation later.

### Logout all sessions

Security settings action with confirmation.

Expected use cases:

- lost device;
- suspected compromise;
- clean reset.

Result:

- all sessions are invalid;
- current client signs out too;
- user logs in again.

---

## 8. Session expiry/revocation

When a valid-looking client credential no longer resolves server-side:

- return stable unauthenticated code;
- client clears local/cookie session material;
- preserve recoverable local draft state where safe;
- redirect/present login;
- do not loop refresh attempts indefinitely.

If a user is editing content when the session expires, the client should preserve unsent text locally where possible, without storing secrets.

---

## 9. Security settings surface

A real account needs a visible “Seguridad” section.

V1 target:

### Password

- change password;
- clear explanation that all sessions will close after success.

### Active sessions

Each session should expose only privacy-bounded metadata:

- session ID for action routing;
- client type: Web or Mobile;
- created time;
- last active time if maintained coarsely;
- expiry;
- current-session indicator.

Do not collect/display raw IP, precise location, hardware fingerprint or full User-Agent merely to make the page look sophisticated.

Actions:

- revoke one other session;
- revoke current session;
- revoke all sessions.

Other-user/unknown session IDs must not reveal existence.

### Recent security activity

The product may later surface user-safe events such as:

- password changed;
- email verified;
- new session created;
- all sessions revoked;
- recovery completed.

Do not expose internal IDs/token hashes/provider errors.

---

## 10. Password change

Requirements:

- authenticated normal session;
- current password required for password-backed accounts;
- new password passes shared policy;
- compare-and-swap/concurrency safety;
- password update and revoke-all must succeed as one security outcome.

Success:

- all sessions including current are revoked;
- cookie/native credential cleared;
- user receives confirmation;
- user must log in again.

Do not silently create a replacement session after password change in v1.

---

## 11. Forgot/reset password

### Request

Input: email.

Public result is always generic:

> “Si existe una cuenta que puede recuperarse, te enviamos instrucciones.”

Do not reveal whether the account exists.

### Recovery token

- cryptographically random;
- one-time;
- hash-only persistence;
- bounded TTL;
- previous pending token rotated/revoked when appropriate;
- never logged.

Recommended v1 TTL: 30 minutes.

### Inspect

A frontend may inspect token validity to render the correct form.

The token itself is authority for this narrow recovery flow, not a normal authenticated session.

### Complete

Input:

- token;
- new password.

Success:

- consume token atomically;
- update password;
- revoke every active session;
- do not auto-login;
- show “Contraseña actualizada. Iniciá sesión de nuevo.”

Expired/reused token:

- safe “link no longer available” state;
- request another.

---

## 12. Google sign-in

Google is an alternate credential/login method, not a second account system.

V1 principles:

- use provider state/PKCE as applicable;
- only trust provider email when Google marks it verified;
- provider access/refresh tokens never become the Los Apuntes session credential;
- provider secrets/tokens never enter app logs;
- successful provider auth ends by issuing a normal Los Apuntes AuthSession.

### Existing account with same email

Do not silently link a Google identity solely because the strings match.

Preferred safe flow:

- if an already-verified password account exists with the Google email, require explicit account linking through an authenticated/reauthenticated flow;
- until linking is completed, explain that the account already exists and offer normal login/recovery.

This can be relaxed only after explicit security review.

### New Google user

If Google proves a verified email:

- create/login account according to account-link rules;
- email verification step can be satisfied by the trusted provider claim;
- proceed to normal onboarding.

Historical OAuth credentials previously used during prototype work are not launch credentials and must not be reused without rotation/revalidation.

---

## 13. Email change

Not required to block the first auth implementation, but the account model must not make it impossible.

Future safe flow:

1. authenticated session;
2. reauthenticate;
3. request new email;
4. verify new email;
5. notify old email;
6. update canonical login email;
7. revoke sessions according to policy.

Do not immediately replace the login email before proof of the new mailbox.

---

## 14. Account closure/deletion

The UI needs a visible path even if final physical deletion policy depends on the domain/retention ADR.

Before implementation resolve:

- shared Resource authorship after closure;
- anonymization vs deletion;
- moderation/audit retention;
- recovery/grace period if any;
- organization management transfer;
- legal retention obligations.

Auth must not implement hard-delete of User in isolation.

---

## 15. Account restriction and compromise

Security/admin actions may revoke sessions without deleting identity.

Expected effects:

- new login may be denied with a safe account-status response after credential proof;
- existing sessions can be revoked;
- future verification/recovery behavior must respect account policy.

Do not expose moderation-internal reasons if policy says they are private.

---

## 16. Error and loading states for Web/Mobile

Every auth screen needs explicit states:

- idle;
- submitting;
- success;
- validation error;
- credential error;
- verification required;
- token expired/unavailable;
- rate/cooldown state;
- network offline;
- timeout;
- server unavailable;
- unexpected sanitized error.

Buttons must prevent accidental duplicate submission while allowing safe retry.

Never branch UX by matching localized message strings. Use stable error codes.

Where support is useful, display the public request ID from the API.

---

## 17. Accessibility and interaction requirements

- labels, not placeholder-only forms;
- keyboard navigation;
- visible focus;
- screen-reader errors associated with the field;
- live region for form-level failure;
- password show/hide announces state;
- do not disable paste;
- support autofill/password managers;
- target sizes suitable for mobile;
- no color-only error semantics;
- loading states keep context instead of blanking the screen;
- back navigation does not accidentally resubmit secrets.

---

## 18. Privacy requirements

Do not collect identity/security telemetry merely because it is technically available.

V1 does not require:

- precise location;
- raw IP history in user-facing session records;
- browser fingerprint;
- hardware fingerprint;
- contact-list access;
- university data during credential creation.

Auth operational logs must never include:

- passwords;
- raw session tokens;
- token hashes;
- cookies;
- verification/recovery tokens;
- OAuth provider tokens;
- full request bodies for sensitive endpoints.

---

## 19. Notifications users should receive

Transactional security notifications are product requirements once the corresponding action ships.

Candidates:

- verify email;
- password recovery requested;
- password changed;
- email changed;
- new Google account linked;
- all sessions revoked;
- significant security restriction where policy allows.

A “new session” email/push can be added later when we have a reliable privacy-safe session context; do not fake device/location detail.

---

## 20. Terms, privacy and consent

Before public launch, registration must link the current Terms and Privacy Notice.

The product needs a versioned record of required acceptance where legally/product-wise necessary.

Exact age/minor handling and jurisdiction-specific consent need explicit legal/product review before launch; do not infer a global university-only age threshold from the UI.

---

## 21. Handoff to academic onboarding

Identity/Auth ends when the app has a verified authenticated account and can bootstrap it safely.

Academic onboarding begins with:

- preferred/display name if not already available;
- university;
- program/career;
- current stage/year;
- current subjects.

Profile completion remains progressive.

Auth must never require a `career_id` just to consider the account valid.

---

## 22. Acceptance from the user's perspective

Identity/Auth v1 is not complete until a user can:

1. create an account without entering academic bureaucracy;
2. understand and complete email verification;
3. log in on Web securely without JavaScript holding the bearer credential;
4. log in on Mobile with one native secure credential;
5. recover a forgotten password without account-existence leakage;
6. change password and know other sessions were closed;
7. inspect and revoke active sessions;
8. log out reliably;
9. understand when a session expired or was revoked;
10. reach academic onboarding after first verified login;
11. use Google sign-in when the provider integration is enabled;
12. access security/privacy/account controls without hunting through hidden menus;
13. receive actionable, localized, accessible error states rather than infrastructure messages.
