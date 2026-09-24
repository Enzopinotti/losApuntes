# ADR 0006 — Native Mobile foundation

**Status:** Accepted  
**Date:** 2026-09-24  
**Issues:** #7, #49

## Decision

Los Apuntes Mobile is a first-party Expo/React Native client using **Expo SDK 57**, React Native 0.86 and Expo Router.

SDK 58 is intentionally not selected while it is in beta and depends on a React Native release candidate. The native foundation prioritizes the current stable Expo line.

## Authority boundaries

Mobile is a client, never a second backend.

- Identity authority remains AuthSession.
- Academic identity remains Academic Graph.
- Profile, Resources, Search, Social/Q&A, Feeds, Organizations and Alumni remain server authorities.
- Mobile persists only the opaque native AuthSession credential in SecureStore.
- No AsyncStorage/localStorage-equivalent auth flag exists.
- No JWT/refresh-token hierarchy is invented.
- No Google provider token becomes the Los Apuntes session.

## Session lifecycle

The credential store uses `expo-secure-store` with device-only accessibility.

Every async auth operation is fenced by:

1. credential generation — the exact opaque credential used by a request;
2. operation generation — the latest restore/login/logout/deep-link operation allowed to commit UI state.

A late 401 from session A cannot clear session B. Logout clears in-memory authority before best-effort SecureStore/server cleanup.

Network failure is not logout.

## Navigation

Expo Router owns native navigation.

Unauthenticated routes:

- sign in;
- register / verification pending;
- forgot/reset password;
- verification/recovery deep-link handlers.

Authenticated tabs:

- Home;
- Search;
- Create;
- Network;
- Profile.

Protected routes redirect from current server-auth state, not from a local boolean.

## Google

Google uses a native/browser OIDC flow through Expo AuthSession and exchanges only the resulting Google ID token with `POST /auth/google/mobile`.

Provider availability comes from `GET /auth/google/status`. Public client IDs are build/runtime configuration. No client secret is shipped.

## Files

Mobile uses the existing Files/Resources intent contract.

Local files are streamed/uploaded directly to the signed storage URL using Expo FileSystem/Expo fetch. The API bearer is sent only to Los Apuntes API, never to object storage.

V1 supports:

- system document/file picker;
- image library;
- camera capture.

OS-level share extensions are deferred until a real native extension lifecycle is separately accepted.

## Build/release

Generated `ios/` and `android/` folders are not committed. CNG + EAS profiles are canonical.

Bundle/application IDs, EAS project ID, signing credentials and store identities remain external release inputs.

A JS export alone is not accepted as native-build evidence. Closure requires at minimum a generated native Android debug build from the exact candidate plus Expo dependency checks and both-platform exports.
