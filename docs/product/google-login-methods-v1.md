# Google sign-in and login methods — Product UX v1

Parent: #4  
Implementation lane: #42

## Purpose

Google is an alternate **login method** for one Los Apuntes Account. It is not a separate profile, not a second account system and not an academic identity.

The user-facing design must make it clear which methods can enter the same account and must never silently merge accounts because two emails look equal.

## Account login-method states

A Los Apuntes Account can be:

- password only;
- Google only;
- password + Google.

No account may end with zero usable login methods.

A Google-only account must not receive an invented/random password.

## Continue with Google — first use

The login/register surface may show “Continuar con Google” only when Google Auth is enabled.

If disabled/misconfigured:

- do not show a button that appears to work;
- password auth remains usable;
- settings may show Google as unavailable only where useful.

### New Google identity

When Google proves a new provider identity and there is no Account collision:

1. Los Apuntes creates one Account;
2. provider email ownership is accepted only under the backend Google-proof policy;
3. Google is recorded as a login method;
4. a normal Los Apuntes AuthSession is issued;
5. the user continues to academic onboarding.

Google name/photo are onboarding suggestions only. They do not silently become permanent Profile truth.

### Existing linked Google identity

Google proof resolves the linked Account by provider subject and issues a normal AuthSession.

Email changes at Google do not create a new Los Apuntes identity.

## Same-email collision

If Google presents an email already used by an existing Los Apuntes Account but the Google provider subject is not linked:

- do not auto-link;
- do not create a duplicate Account;
- return a stable “Vinculá Google a tu cuenta existente” state;
- offer normal login/recovery;
- after existing-method reauthentication, start explicit linking.

The UX must explain that this protects the account rather than implying the Google login “failed randomly”.

## Cuenta > Seguridad > Métodos para iniciar sesión

Security Settings gains a “Métodos para iniciar sesión” section.

### Contraseña

Show:

- Configurada; or
- No configurada.

A Google-only user can establish a password through the verified-email recovery/set-password path.

### Google

Show:

- Conectado; or
- No conectado.

Actions:

- Conectar Google;
- Desconectar Google only when another usable login method remains.

Do not display:

- Google `sub`;
- ID/access/refresh tokens;
- OAuth state/nonce;
- internal ExternalIdentity IDs.

## Linking Google

Link requires:

- active account/session;
- reauthentication with an existing login method;
- explicit user intent;
- one short-lived Google proof bound to that account.

Password-backed v1:

- ask current password;
- then begin Google link flow.

Google-only account already has its one Google identity and cannot link a second Google identity in v1.

### Link success

Show:

> “Google quedó conectado como método para iniciar sesión.”

The current Los Apuntes session remains valid unless security policy requires otherwise.

Send a transactional security notification when delivery is configured.

## Unlinking Google

Unlink requires reauthentication.

If removing Google would leave zero login methods:

- block the action;
- explain that the user must first configure a password.

Success:

> “Google ya no está conectado a tu cuenta.”

A disconnected Google identity cannot login again unless explicitly re-linked.

## Web flow states

Web must represent:

- restoring current session;
- logged out;
- password login;
- registration accepted / verification pending;
- Google available;
- Google unavailable;
- user cancelled/denied consent;
- provider proof invalid/expired;
- same-email link required;
- provider already linked elsewhere;
- account restricted;
- network timeout/offline;
- server error;
- successful Google login;
- successful Google link/unlink.

Do not expose provider error strings as UX.

## Mobile flow states

Mobile has the same product states.

The provider SDK/browser may differ by platform, but after backend proof Mobile receives only a normal Los Apuntes opaque AuthSession bearer for SecureStore.

No Google token becomes persistent app auth state.

## Web callback UX

The browser callback is a server endpoint, not a UI page.

After success/failure the server redirects to one allow-listed frontend route containing only bounded, non-secret state such as:

- `google=success`;
- `google=link_required`;
- `google=cancelled`;
- `google=failed`.

No authorization code, provider token, session token, state or nonce may appear in the final app URL.

## Frontend real-auth migration

The historical fake auth path is removed.

Web AuthProvider:

- restores through `GET /auth/me`;
- uses cookie credentials;
- never stores bearer token in localStorage;
- distinguishes network failure from unauthenticated;
- generation-fences stale restore/login/logout responses.

Login:

- calls real `POST /auth/login`;
- branches on stable `code`;
- Google button navigates to backend Google start when enabled.

Register:

- calls real `POST /auth/register`;
- no automatic login;
- routes to verification-pending.

Logout:

- calls `DELETE /auth/session` with trusted Origin/credentials;
- local state clears after completion/error policy;
- no stale restore may resurrect the session.

## Accessibility

Google/login-method UI must:

- use real button semantics;
- work by keyboard;
- expose loading/disabled state;
- announce provider errors accessibly;
- not rely on logo/color alone;
- preserve focus after popup/redirect failure;
- provide a password/recovery alternative.

## Privacy

Request only the identity scopes needed for v1:

- openid;
- email;
- profile.

Do not request Drive, Gmail, Calendar, Contacts or academic Workspace data.

Do not import Google contacts/profile activity.

Provider display name/photo are optional suggestions, not Profile authority.

## Notifications

When practical, notify the verified account email after:

- Google linked;
- Google unlinked.

Do not include provider tokens or internal IDs.

## Launch checklist

Before Google is shown publicly:

- fresh Google OAuth clients exist;
- consent screen is reviewed;
- exact redirect URIs are configured;
- production secret is outside Git;
- link/unlink UX exists or linking is deliberately disabled;
- provider-enabled manual smoke succeeds;
- error/cancel paths are tested;
- password auth still works if Google is unavailable;
- support copy exists for same-email collision.

## Definition of user-complete

Google/Auth integration is complete when a user can:

1. use password auth without fake/localStorage authority;
2. use Continue with Google when enabled;
3. understand a same-email link-required state;
4. explicitly connect Google after authenticating an existing Account;
5. inspect login methods in Security Settings;
6. disconnect Google only when another method remains;
7. use Mobile without storing Google tokens;
8. recover through password/email if Google is unavailable and a password method exists;
9. receive understandable, accessible provider failure states.
