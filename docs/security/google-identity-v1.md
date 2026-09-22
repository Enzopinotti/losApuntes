# Google identity security contract v1

Parent: #4  
Implementation lane: #42

## Stable identity

Google identity authority is the provider subject claim `sub`.

Email is a verified communication/login attribute, not the stable provider identity key.

ExternalIdentity conceptual fields:

- provider = `google`;
- providerSubject;
- userId;
- emailAtLink;
- linkedAt.

Uniqueness:

- provider + providerSubject unique;
- one Google identity per Account in v1.

## Provider verification

Production uses a narrow adapter around Google's official Auth Library.

The normalized proof contains only:

- subject;
- email;
- emailVerified;
- hostedDomain when present;
- optional displayName/avatar suggestion.

Production verification validates token signature and accepted audience/issuer/expiry through the official library.

The domain/service never accepts client-supplied email/userId as Google authority.

## Web authorization-code attempt

A Web OAuth attempt is short-lived and one-time.

Conceptual state:

- attemptId;
- state hash;
- nonce hash;
- PKCE verifier;
- intent: login | link;
- bound Account/session for link;
- safe internal return destination;
- expiresAt;
- consumed state.

Recommended TTL: 10 minutes.

Raw state/nonce/provider code/token never enter logs.

Callback replay or expired attempt fails closed.

## Mobile proof

Mobile presents provider proof to a dedicated backend endpoint.

Backend verifies the Google ID token against an allow-list of native audiences, then applies the same ExternalIdentity/account rules.

The result is a Los Apuntes Mobile AuthSession, not a Google token.

## Same-email collision

Email equality is not linking authority.

Unlinked Google subject + existing Account email => `GOOGLE_LINK_REQUIRED`.

No duplicate Account and no automatic link.

## Linking

Link requires:

- authenticated active Account;
- explicit link intent;
- reauthentication;
- OAuth attempt bound to that Account;
- providerSubject uniqueness check.

Password-backed v1 uses current password for reauthentication.

## Unlinking

Unlink requires reauthentication and at least one alternative usable login method.

No Account can have zero login methods.

## Provider token retention

Los Apuntes v1 does not call Google APIs on behalf of the user.

Therefore:

- do not persist Google access tokens;
- do not persist Google refresh tokens;
- do not persist Google ID tokens;
- do not request offline access.

## Redirect safety

Return destinations are internal/allow-listed.

Never accept arbitrary external return URLs.

Final frontend redirect contains no secret credential.

## Disabled mode

`GOOGLE_AUTH_ENABLED=false` is fail-safe.

Google endpoints return a stable unavailable result and no fake provider behavior is exposed.

Tests may inject a fake verifier explicitly; production runtime never silently substitutes a fake Google identity.

## Audit

Bounded events:

- `auth.oauth.linked`;
- `auth.oauth.unlinked`.

No provider code/token/state/nonce/client secret in audit payloads.

## Concurrency invariants

Tests must prove:

- concurrent first login cannot create duplicate Account/ExternalIdentity;
- one provider subject cannot belong to two Accounts;
- callback attempt can be consumed once;
- link attempt cannot be rebound to another Account;
- unlink cannot remove last login method.

## Configuration

Server configuration is explicit:

- `GOOGLE_AUTH_ENABLED`;
- `GOOGLE_WEB_CLIENT_ID`;
- `GOOGLE_WEB_CLIENT_SECRET`;
- `GOOGLE_WEB_REDIRECT_URI`;
- native allowed audience list;
- safe frontend redirect base.

When enabled, required Web config must fail startup if incomplete.

Secrets remain outside Git.
