# ADR 0006 — Expo native foundation for Mobile v1

**Status:** Accepted  
**Date:** 2026-09-24  
**Issues:** #7, #49

## Context

Los Apuntes defines Mobile as a first-class product, not a Web wrapper. The backend already exposes a native Identity/Auth boundary based on the same opaque server-side AuthSession authority used by Web:

- `POST /auth/mobile/login` returns a mobile session credential;
- `Authorization: Bearer <opaque session token>` is accepted by the same AuthSession lookup;
- `GET /auth/me` revalidates current account/session authority;
- logout, revoke-one, revoke-all and password change invalidate server-side sessions;
- native Google login terminates at `POST /auth/google/mobile`;
- verification and password-recovery action tokens are one-time server-side credentials.

The repository intentionally delayed framework selection during rescue. A real native foundation is now required to advance #7/#49.

As of 2026-09-24, Expo SDK 57 is the current stable Expo SDK. Expo SDK 58 is beta. SDK 57 targets React Native 0.86 and React 19.2.3.

## Decision

Build Mobile v1 with:

- Expo SDK 57;
- React Native 0.86;
- React 19.2.3;
- Expo Router typed routes;
- Expo Dev Client for native integrations;
- `expo-secure-store` as the only durable location for the Los Apuntes opaque mobile session credential;
- `react-native-safe-area-context` for safe-area ownership;
- TypeScript strict mode.

The app lives in `apps/mobile` and consumes transport contracts from `@losapuntes/contracts`.

## Authentication authority

Mobile does not create a second authentication system.

The only long-lived Los Apuntes credential is the opaque server session token returned by approved mobile login boundaries. The token:

- is stored only in SecureStore/Keychain/Keystore-equivalent storage;
- is sent only in the Authorization header to the configured Los Apuntes API origin;
- is never written to AsyncStorage, URL/query state, analytics, crash metadata or ordinary logs;
- is cleared locally on logout even when network revocation fails;
- is revalidated through `GET /auth/me` during restore;
- is fenced by credential/operation generation so stale responses cannot resurrect or clear a newer session.

Google provider credentials are proofs supplied to the backend. They are not Los Apuntes sessions.

## Bootstrap state model

The native session owner distinguishes at least:

- restoring;
- authenticated;
- unauthenticated;
- restricted;
- offline;
- timeout;
- server unavailable;
- unexpected sanitized error.

Transport failure is not equivalent to logout.

A 401/invalid session may clear the local credential only if the request used the currently authoritative credential generation. A delayed response from an older restore/login may never mutate a newer session.

## Deep links

The application scheme is `losapuntes`.

V1 reserves deep-link intents for:

- email verification;
- password recovery;
- native provider return only when required by the selected Google provider integration.

One-time action tokens are parsed into an in-memory action-token vault and removed from ordinary route state before rendering the destination screen. Invalid/expired tokens fail closed and never become persisted navigation history.

## API origin

Mobile receives one explicit API origin from build/runtime configuration.

Rules:

- it must be an absolute HTTP(S) origin;
- production must use HTTPS;
- bearer credentials are attached only to that configured origin;
- redirects to a different origin are not followed as authenticated application requests;
- timeout and abort behavior are explicit.

## UX/accessibility baseline

Native Auth screens must support:

- platform password-manager/autofill semantics;
- keyboard-safe layout;
- screen-reader labels and roles;
- visible pending/retry/error states;
- errors mapped by stable server code rather than English message matching;
- no color-only security/error meaning;
- Dynamic Type/text scaling without clipping the primary action.

## Why Expo

Expo provides the native build/configuration surface needed by #7 while keeping one React Native application for iOS and Android. SDK 57 is stable and aligns with React Native 0.86.

This decision does not make Expo Go a production acceptance environment. Native provider integration, keychain behavior, deep links and build configuration require development/release builds.

## Rejected alternatives

### Responsive Web/PWA only

Rejected. #7 explicitly requires first-class native behavior, secure platform credential storage, native links and device acceptance.

### Separate iOS and Android applications

Rejected for v1. The product does not yet justify two independent native codebases and duplicated domain behavior.

### AsyncStorage bearer persistence

Rejected. The mobile session credential is authentication authority and belongs in platform secure storage.

### Expo SDK 58 beta

Rejected for this carrier. Mobile v1 should start on the current stable SDK rather than a beta SDK while Auth/security behavior is being established.

### Client refresh-token/JWT layer

Rejected. It would create a second session system outside the existing server authority.

## Consequences

Positive:

- Web and Mobile share one backend identity authority;
- native credentials have an explicit secure-storage boundary;
- session races are designed out before screens multiply;
- Expo Router/deep-link behavior can be tested as a product contract;
- the stack matches the engineering reference already exercised in TOP without copying TOP-specific product code.

Costs:

- Expo/native dependencies become part of the workspace lockfile and CI;
- real-device/simulator evidence is still required before #49/#7 can close;
- native Google configuration needs provider/app-store credentials outside source control.

## Acceptance boundary

This ADR authorizes implementation. It does not itself prove Mobile completion.

#49 remains open until a clean native build exercises the required Auth journeys. #7 remains open until the broader product acceptance path works without Web fallback.
