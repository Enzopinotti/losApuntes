# Mobile v1 product contract

**Issues:** #7 + #49  
**Status:** In implementation

## Mission

Ship Mobile as a day-one Los Apuntes product, not a wrapper around Web.

A clean user must be able to authenticate, recover access, enter a valid academic context, discover/open/save/upload a Resource, and recover from session/network/context changes without Web-only fallback.

## Core state model

Session phases:

- restoring;
- anonymous;
- authenticated;
- restricted;
- offline;
- timeout;
- server-unavailable;
- error.

Transient transport failure never mutates an authenticated credential into an anonymous state.

Sensitive state is cleared synchronously on explicit logout, revoke-all, password change and matching-generation 401.

## Bootstrap

Authenticated bootstrap composes existing authorities:

- `GET /auth/me`;
- `GET /profile/me`;
- `GET /academic/me/context`;
- `GET /academic/me/affiliations`;
- `GET /academic/me/subjects`.

The app does not cache those responses as permanent authority. Foreground restore revalidates session and context.

## Authentication journeys

Native supports:

- registration;
- verification request/pending/deep link/complete;
- email/password login;
- password recovery request/deep link/complete;
- logout;
- session inventory;
- revoke one / revoke all;
- authenticated password change;
- Google login when provider configuration is enabled;
- explicit Google link/unlink;
- restricted account state.

## Product tabs

### Home

Contextual Home uses the existing Pilot/Feed projections. It is not a KPI dashboard and does not invent infinite-scroll behavior beyond server stop reasons.

### Search

Consumes Search v1 and preserves opaque cursors unchanged.

### Create

Creates Resources through upload-intent -> direct signed PUT -> finalize -> Resource create. Academic subject context is canonical server data.

### Network

Surfaces Q&A / people / campus organization entry points from existing APIs. It does not invent client-side trust or ranking.

### Profile

Consumes Profile v1 and account security/session surfaces. Academic identity is read-only here.

## Deep links

The custom scheme `losapuntes://` accepts only known bounded routes.

One-time verification/recovery tokens are consumed into transient screen state and are never written to SecureStore or ordinary navigation persistence.

## Offline/degraded UX

Offline bootstrap keeps only non-secret presentation state already in memory and explicitly shows degraded state. It never presents unaudited cached API data as current authority.

## Accessibility

- native accessibility labels/roles;
- keyboard/autofill semantics;
- no color-only errors;
- minimum practical touch targets;
- dynamic small-screen scrollability;
- retry controls for recoverable states.

## Completion evidence

Before closing #7/#49:

- Mobile unit/contract tests;
- strict TypeScript;
- Expo dependency compatibility;
- iOS + Android JS exports;
- real Android native debug build;
- static contract proving no AsyncStorage/session bearer leak;
- exact-head CI;
- post-merge CI.
