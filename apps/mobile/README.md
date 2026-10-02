# Mobile

Los Apuntes Mobile is a first-class native product built with Expo SDK 57 / React Native 0.86.

Current carrier: #49 under #7.

## Local start

1. copy `env.example` to an ignored `.env.local` and point `EXPO_PUBLIC_API_ORIGIN` at a reachable API origin;
2. run `pnpm install` from the repository root;
3. run `pnpm --filter @losapuntes/mobile start` for JS iteration;
4. use a development/release build for SecureStore, native provider and deep-link acceptance.

The opaque Los Apuntes mobile session credential is stored only in `expo-secure-store`. Do not add AsyncStorage/MMKV persistence for authentication.

See:

- `docs/adr/0006-mobile-expo-native-foundation.md`;
- `docs/mobile/auth-v1.md`.

## Release qualification

Mobile release identity is intentionally separate from device/store evidence.

For a distributed release candidate, embed:

- `EXPO_PUBLIC_RELEASE_SHA`: the exact 40-character source Git SHA;
- `EXPO_PUBLIC_DISTRIBUTION_PROFILE`: exactly `preview` or `production` for a qualifying artifact; `development` is explicitly non-qualifying and unknown profile names fail closed;
- `EXPO_PUBLIC_API_ORIGIN`: the exact backend origin baked into the build.

App version and build number come from Expo's immutable native binary identity (`Constants.nativeAppVersion` and `Constants.nativeBuildVersion`), not mutable OTA config and not `NODE_ENV`.

The qualification contract also requires a **server release observation bound to the same API origin**. It does not accept a bare release string. The current API readiness endpoints do not expose release identity, so do not substitute `main`, a guessed SHA, a CI run number or hand-authored evidence. Until a real server release identity can be observed from the configured API, qualification must remain `blocked`.

HTTP loopback targets are valid for local development only. Qualification requires HTTPS and rejects API origins containing credentials, paths, query strings or fragments.

CI/source evidence does not claim simulator, physical-device, signing, store or provider validation.
