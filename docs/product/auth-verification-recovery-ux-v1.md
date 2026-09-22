# Identity/Auth v1.3 — Email verification & password recovery UX

Parent: #4  
Implementation lane: #40

## Purpose

This document defines the user-facing contract for email verification and password recovery.

The backend can be secure and still produce a bad product if users do not understand:

- whether registration worked;
- whether an email was sent;
- whether a link expired;
- whether they need to request another link;
- whether password recovery signed out other devices;
- what to do when an email does not arrive.

This document is the client/product handoff for those cases.

---

## 1. Registration -> verification handoff

A new email/password account is created in an **unverified** state.

Registration success does not mean the user is signed in.

Public response remains bounded and does not reveal whether another account already owns the email.

### Recommended confirmation screen

Title:

> Revisá tu email

Body:

> Si podemos continuar con esa cuenta, te enviamos un enlace para verificar el email.

For a user who just registered in the current client, the UI may also show the email they entered because that value came from their own form state.

Actions:

- open email app where platform support exists;
- resend;
- use another email;
- go to login.

Do not display a countdown that implies delivery is guaranteed in exactly N seconds.

---

## 2. Verification email

Subject:

> Verificá tu email en Los Apuntes

The message must contain:

- recognizable Los Apuntes identity;
- a single verification CTA;
- fallback URL;
- expiration information;
- “si no creaste esta cuenta” guidance;
- no academic/private profile information.

Current security lifetime:

- 24 hours.

### Link destination

Canonical frontend route:

`/auth/verify-email?token=<one-time-token>`

The frontend must:

1. read the token;
2. remove it from the visible URL/history as early as practical;
3. call the inspect/complete API;
4. never persist it in localStorage/sessionStorage/analytics.

Mobile may open the same HTTPS route through app/universal-link association later. The raw token still belongs only to this narrow verification flow.

---

## 3. Verification screen states

### Loading / inspecting

Show a bounded loading state:

> Estamos revisando el enlace…

Do not show the token.

### Available

The client may immediately complete verification or show a deliberate CTA.

Recommended simple v1:

> Verificar email

If completion is automatic, the screen must still preserve enough context so a network failure can be retried safely.

### Success

Title:

> Email verificado

Body:

> Tu cuenta ya está lista para iniciar sesión.

Primary action:

> Iniciar sesión

Do not automatically create a long-lived AuthSession in v1.

### Unavailable / expired / already used

The API returns:

`VERIFICATION_NOT_AVAILABLE`

User message:

> Este enlace ya no está disponible.

Actions:

- request another verification email;
- go to login;
- return to registration if the email was incorrect.

Do not distinguish expired vs previously used if that distinction does not improve user action.

### Network/offline

Message:

> No pudimos comprobar el enlace. Revisá tu conexión e intentá de nuevo.

Do not label the token expired because the API could not be reached.

---

## 4. Verification resend

The resend screen/input accepts email and always returns a bounded public result.

User-facing outcome:

> Si esa cuenta necesita verificación, te enviamos un nuevo enlace cuando sea posible.

The server currently enforces:

- per-account/purpose cooldown;
- bounded active-token count;
- multiple still-valid links may coexist;
- a successful verification invalidates all remaining verification links.

### UX implication

Do not say:

> El enlace anterior dejó de funcionar.

That is not guaranteed until verification succeeds or the token expires/gets capped.

### Cooldown

The API intentionally keeps the public request result bounded.

The UI may apply a client-side resend countdown for usability, but it is not security authority and should not imply exact backend state.

Recommended initial UI cooldown:

- 60 seconds before re-enabling resend on the same screen.

A page reload may reset the visual countdown; server-side issuance rules remain authoritative.

---

## 5. Login before verification

Wrong email/password:

`INVALID_CREDENTIALS`

Message:

> Email o contraseña incorrectos.

Correct password + unverified account:

`EMAIL_VERIFICATION_REQUIRED`

Message:

> Verificá tu email para continuar.

Actions:

- resend verification;
- use another account;
- recover password if needed.

This distinction is allowed only after password knowledge has been proven.

---

## 6. Forgot-password request

Route suggestion:

`/auth/forgot-password`

Input:

- email.

Public success is always bounded:

> Si existe una cuenta que puede recuperarse, te enviamos instrucciones.

Do not show:

- “email not found”;
- “account exists”;
- verification status;
- account restriction details.

Actions:

- return to login;
- resend later if needed.

---

## 7. Recovery email

Subject:

> Recuperá tu acceso a Los Apuntes

Current lifetime:

- 30 minutes.

Message requirements:

- clear password-recovery purpose;
- one CTA;
- fallback URL;
- expiration guidance;
- “si no lo pediste, ignoralo” guidance;
- no existing/new password;
- no profile/academic data.

Canonical frontend route:

`/auth/reset-password?token=<one-time-token>`

The frontend removes the token from visible URL/history as early as practical and never persists it in analytics/browser storage.

---

## 8. Reset-password screen states

### Inspecting link

> Estamos revisando el enlace…

The password form should not appear until the token is known to be available.

### Available

Show:

- new password;
- show/hide control;
- password policy;
- submit.

Policy:

- minimum 12 characters;
- maximum 256;
- no forced upper/lower/number/symbol composition;
- spaces/paste/password managers supported.

### Submission

Disable accidental duplicate submit while request is active.

Do not clear the entered new password after a recoverable network failure unless platform security behavior requires it.

### Success

Title:

> Contraseña actualizada

Body:

> Cerramos tus sesiones anteriores. Iniciá sesión de nuevo para continuar.

Primary action:

> Iniciar sesión

No auto-login.

### Unavailable / expired / already used / stale

API code:

`RECOVERY_NOT_AVAILABLE`

Message:

> Este enlace ya no está disponible.

Actions:

- request a new recovery email;
- return to login.

### Network/offline

> No pudimos comprobar el enlace. Revisá tu conexión e intentá de nuevo.

Do not mislabel an unreachable server as an invalid token.

---

## 9. What recovery does to sessions

A successful password recovery increments the account credential version.

Every session created under the previous version immediately stops being authentication authority.

User-visible consequence:

- Web sessions become signed out;
- Mobile sessions become signed out;
- previous cookies/bearers cannot restore the account;
- the user logs in again with the new password.

The UI should explain this **before** completion:

> Por seguridad, al cambiar la contraseña se cerrarán tus otras sesiones.

---

## 10. Recovery confirmation email

After a successful password reset, send a security notification.

Subject:

> Tu contraseña de Los Apuntes fue actualizada

Message:

- password was changed;
- prior sessions were closed;
- if the user did not make the change, request a new password recovery immediately.

Do not instruct the user to “contact support” until Los Apuntes has a defined and monitored support/security channel.

A support/security contact route remains a public-launch requirement.

---

## 11. Delivery delay/failure experience

The public request endpoints intentionally return bounded outcomes even when account state differs.

The product therefore cannot promise:

> “Te enviamos el email.”

Prefer:

> “Si podemos continuar con esa cuenta, te enviamos instrucciones.”

### If email does not arrive

The UI should offer:

- check spam/junk;
- verify the typed email;
- wait briefly;
- resend;
- return to login/register.

Do not disclose whether delivery failed because the account does not exist or because the provider failed.

### Operational requirement

Silent public responses require **internal monitoring** of delivery errors.

Before launch, operations must be able to detect:

- SMTP/provider outage;
- elevated bounce/error rate;
- repeated delivery failures.

The user-facing API remains bounded; operations should not remain blind.

---

## 12. Accessibility

Verification/recovery surfaces require:

- real labels;
- visible keyboard focus;
- status announcements through live regions;
- error text not encoded by color only;
- accessible show/hide password control;
- password-manager support;
- no forced paste blocking;
- clear action hierarchy;
- touch targets suitable for Mobile;
- loading state that does not erase the page structure.

One-time-token failures should move focus to the explanatory status/primary recovery action.

---

## 13. Privacy and analytics

Never send these to analytics:

- raw verification token;
- raw recovery token;
- password;
- email link URL containing a token;
- SMTP/provider credentials.

Safe product events may include:

- verification screen viewed;
- verification completed;
- verification unavailable;
- resend requested;
- recovery screen viewed;
- recovery completed;
- recovery unavailable.

Prefer coarse product events. Avoid using raw email as analytics identity.

---

## 14. Web/Mobile race handling

Clients must generation-fence the flow.

Examples:

- a stale verification inspect response cannot overwrite a newer successful completion;
- a stale recovery inspect cannot resurrect a token after completion;
- navigating away/login cannot be overwritten by a late recovery request;
- repeated submit should produce one visible outcome.

Latest relevant flow wins.

---

## 15. Required routes for frontend

Web should reserve:

- `/auth/verify-email`
- `/auth/forgot-password`
- `/auth/reset-password`
- `/login`

Mobile should support equivalent screens and, later, HTTPS universal/app links for verification/recovery links.

Do not create client-only API semantics. Both clients consume the same backend error codes.

---

## 16. API mapping

### Verification

- `POST /auth/email-verification/request` -> 202 bounded request
- `POST /auth/email-verification/inspect` -> 200 available / 410 unavailable
- `POST /auth/email-verification/complete` -> 204 / 410

### Recovery

- `POST /auth/password/recovery/request` -> 202 bounded request
- `POST /auth/password/recovery/inspect` -> 200 available / 410 unavailable
- `POST /auth/password/recovery/complete` -> 204 / 410

All responses:

- `Cache-Control: no-store`;
- stable error code;
- public requestId;
- no raw token echo.

---

## 17. Product completion checklist

This lifecycle is user-complete only when:

- Web implements all required screens/states;
- Mobile has equivalent screens;
- verification/recovery deep links route safely;
- transactional email provider is configured in production;
- delivery monitoring exists;
- sender domain/authentication is configured;
- Privacy/Terms links are current;
- support/security escalation path exists before public launch;
- Spanish copy is reviewed;
- later PT/EN localization uses stable API codes, not server message strings;
- analytics do not capture one-time secrets;
- accessibility is tested on keyboard/screen reader/mobile;
- recovery visibly explains session revocation.

Backend completion alone is not product completion.
