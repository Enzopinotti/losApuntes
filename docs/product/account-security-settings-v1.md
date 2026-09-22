# Identity/Auth v1.4 — Account Security Settings UX

Parent: #4  
Implementation lane: #41

## Purpose

The Security area must help a normal student understand and control account access without exposing infrastructure concepts.

It is not a debug page for sessions/tokens.

The first version should make these questions easy to answer:

- “¿Cómo cambio mi contraseña?”
- “¿Dónde tengo la cuenta abierta?”
- “¿Cómo cierro una sesión que no reconozco?”
- “¿Qué pasa si cierro todas?”
- “¿Por qué mi cuenta está restringida?”
- “¿Dónde voy a cambiar email o cerrar la cuenta cuando esas funciones estén disponibles?”

---

## 1. Security information architecture

Suggested Account > Security sections:

1. Password
2. Active sessions
3. Account status
4. Security activity — reserved/future user-visible history
5. Email — current email + future change action
6. Close/Delete account — visible future surface, not hidden support-only behavior

Do not mix academic profile settings with security controls.

---

## 2. Password section

Show:

- “Contraseña”
- action: “Cambiar contraseña”
- short consequence copy:

> Al cambiarla, cerraremos tus sesiones actuales por seguridad.

### Change-password form

Fields:

- current password;
- new password;
- show/hide controls.

Password policy:

- 12–256 characters for the new password;
- no forced uppercase/number/symbol checklist;
- spaces/paste/password managers allowed.

Current password accepts the credential as it exists; it is not validated with the new-password minimum before authentication.

### Errors

Wrong current password:

> La contraseña actual no es correcta.

Invalid new password:

> Usá una contraseña de al menos 12 caracteres.

Concurrent/stale security change:

> Tu cuenta cambió mientras hacíamos esta operación. Iniciá sesión de nuevo e intentá otra vez.

Do not show database/CAS/version terminology.

---

## 3. Password-change success

Success should not leave the user wondering why the app immediately logs out.

Recommended screen/toast before transition:

> Contraseña actualizada  
> Cerramos tus sesiones anteriores. Iniciá sesión de nuevo para continuar.

Web:

- session cookie is cleared.

Mobile:

- SecureStore credential is cleared.

No auto-login.

A confirmation security email should also be sent when delivery is configured.

---

## 4. Active sessions

Each row/card exposes only:

- Web or Mobile;
- created time;
- coarse last active time;
- expiry where useful;
- “Esta sesión” marker.

Do not expose by default:

- raw IP;
- exact geolocation;
- full User-Agent;
- device fingerprint;
- hardware identifiers.

Those signals may later help abuse detection internally, but do not belong in v1 just to make the UI feel detailed.

---

## 5. Revoke one session

Non-current row action:

> Cerrar sesión

Confirmation:

> ¿Cerrar esta sesión?  
> Ese dispositivo tendrá que iniciar sesión de nuevo.

Success:

> Sesión cerrada.

Unknown/already-revoked target should still end in a safe, non-enumerating outcome.

---

## 6. Revoke current session

The current session can be closed through normal logout or the session-management surface.

When current Web session is revoked:

- clear cookie;
- go to login.

When current Mobile session is revoked:

- clear SecureStore;
- go to login.

Preserve safe unsent drafts where practical.

---

## 7. Revoke all sessions

Action label:

> Cerrar todas las sesiones

Confirmation:

> Vas a cerrar Los Apuntes en todos tus dispositivos, incluido este.

Use cases:

- lost device;
- suspicious access;
- intentional clean reset.

Success returns the current client to login.

---

## 8. Account status

V1 statuses:

- active;
- restricted.

Normal active users do not need a status badge everywhere.

### Restricted state

If credentials are correct but the account is restricted, show a dedicated account-status surface rather than “wrong password”.

Recommended copy:

> Tu cuenta tiene acceso restringido.

The detailed reason/appeal path depends on moderation/account policy and must not be invented by Auth.

The screen should eventually link to the official review/support path when one exists.

A restricted account must not be able to continue because an old cookie/bearer still exists.

---

## 9. Security activity

The backend introduces a sanitized audit event boundary in this lane.

A user-visible “Actividad de seguridad” list is **not automatically enabled** until retention/privacy/product decisions are complete.

Future safe entries may include:

- password changed;
- recovery completed;
- session revoked;
- all sessions revoked;
- email verified;
- Google linked/unlinked.

Do not surface internal IDs, token data, provider errors or precise location.

The UI may reserve the section without faking history.

---

## 10. Email section

Show current login email.

Email change is intentionally deferred until the full safe flow exists.

Do not implement a naive editable email text field.

Future action:

> Cambiar email

Required future sequence:

1. reauthenticate;
2. enter new email;
3. verify new mailbox;
4. notify previous mailbox;
5. change canonical login email;
6. apply session-revocation policy.

Until that lifecycle exists, the UI should not expose a control that appears functional.

---

## 11. Close/Delete account

The action should eventually be discoverable from account settings.

It must not be hidden exclusively behind support.

However, v1 Auth must not hard-delete the account yet.

Blocked questions include:

- notes/resources authorship;
- Q&A/posts;
- moderation evidence;
- organization management;
- alumni history;
- anonymization/tombstone;
- retention/grace period.

The product can reserve:

> Cerrar o eliminar cuenta

with an explanatory “próximamente / no disponible en esta versión” state only if that is useful in the shipped client; otherwise omit until the end-to-end policy exists.

Do not create a fake delete button.

---

## 12. Reauthentication

Sensitive actions must make the reason clear.

Password change:

- current password is the reauthentication proof.

Future email change / account closure / OAuth linking:

- explicit reauthentication required.

Do not rely solely on “the user already has an old session”.

---

## 13. Restricted vs logged-out vs offline

Clients must distinguish:

### Authentication required
Session absent/expired/revoked.

Action:

- login.

### Account restricted
Identity/session was proven but server policy blocks access.

Action:

- account-status/review path.

### Offline/server unavailable
Authority could not be checked.

Action:

- retry/connectivity state.

Do not convert network failure into logout.

---

## 14. Accessibility

Security settings require:

- proper headings;
- keyboard navigation;
- focus restoration after dialogs;
- accessible confirmation dialogs;
- password show/hide announcement;
- error association with fields;
- session actions labelled with enough context;
- no color-only warnings;
- touch-friendly destructive actions;
- no auto-closing dialogs before assistive technology can announce success.

---

## 15. Privacy

The Security UI should be useful without surveillance.

Do not collect/display detailed device/location data unless a later threat/privacy review proves it is necessary.

A list saying “Web · última actividad hace 2 h” is preferable to pretending we know “Chrome on MacBook at Calle X” from unreliable signals.

---

## 16. Notifications

Password change should generate a transactional security notification.

Message should say:

- password changed;
- old sessions are no longer valid;
- if the user did not make the change, request password recovery immediately.

Do not include the password, session IDs or technical metadata.

---

## 17. Client race/fencing behavior

Security screens must ignore stale requests.

Examples:

- session list fetched before revoke-all cannot reappear after revoke-all;
- stale password-change failure cannot overwrite a later logout;
- stale `/auth/me` cannot resurrect a session after password change;
- revoking another session must not accidentally clear the current credential.

Latest relevant security operation wins.

---

## 18. Frontend contract

Expected API surfaces after #41:

- `GET /auth/sessions`
- `DELETE /auth/sessions/:sessionId`
- `DELETE /auth/sessions`
- `DELETE /auth/session`
- `POST /auth/password/change`
- `GET /auth/me`

Stable errors drive localized UX.

The client does not infer account status from route access or cached profile state.

---

## 19. Launch checklist

Before public launch:

- password-change screen exists on Web/Mobile;
- session management is reachable;
- destructive confirmations are reviewed;
- restricted-account UX has a real review/support owner;
- security mail sender/provider is configured;
- no secrets enter analytics;
- accessibility is tested;
- email-change and account-closure limitations are stated honestly;
- client clears credentials after password change/revoke;
- old/stale auth responses are fenced.
