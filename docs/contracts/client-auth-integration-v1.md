# Web and Mobile Auth integration notes v1

Parent: #4  
Implementation lane: #42

## Shared rule

Clients consume the backend contract. They do not recreate identity rules.

## Web AuthProvider state

Recommended state machine:

- restoring;
- anonymous;
- authenticated;
- unavailable/transient-error.

Account status-specific screens are product routes, not a reason to persist a bearer in JavaScript.

Keep:

- current user;
- current public session;
- restore status;
- bounded last error.

Do not keep:

- raw Web token;
- password;
- verification/recovery token after action completion.

## Request behavior

Web API requests use `credentials: include`.

Auth mutation requests originate from configured Web origin.

Stable API `code` drives state mapping.

## Generation fencing

Every restore/login/logout operation captures an auth generation.

A response applies only if its generation is still current.

Examples:

- an old restore cannot overwrite a later logout;
- an old login cannot overwrite a later account switch;
- a 401 from a stale request cannot clear a freshly created session.

## Registration

The UI may collect confirm-password locally but sends only email/password.

Name belongs to Profile/onboarding, not credential creation.

Success => verification-pending state.

## Verification/recovery

Existing #40 contracts remain the source for verification/recovery screens.

Do not put action tokens in app logs/analytics.

## Google Web

When enabled, Continue with Google navigates to backend start endpoint.

The frontend receives only bounded final status after callback redirect.

## Mobile

Store Los Apuntes session bearer only in SecureStore-equivalent.

Google SDK token/proof remains transient and is handed to backend verification.

## Belén handoff

Visual design can change freely while preserving:

- state semantics;
- accessible forms;
- stable error-code mapping;
- no fake auth;
- no localStorage bearer;
- no network-error-as-logout;
- safe redirect handling.
