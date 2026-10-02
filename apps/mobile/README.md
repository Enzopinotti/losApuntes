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
- `EXPO_PUBLIC_DISTRIBUTION_PROFILE`: a bounded profile such as `internal`, `preview` or `production`;
- `EXPO_PUBLIC_API_ORIGIN`: the exact backend origin baked into the build.

The qualification contract also requires the native app build identifier and an **observed server release id**. The current API readiness endpoints do not expose a server release id, so do not substitute `main`, a guessed SHA or a CI run number. Until a real server release identity can be observed, qualification must remain `blocked`.

HTTP loopback targets are valid for local development only. A production qualification requires HTTPS and rejects API origins containing credentials, paths, query strings or fragments.

CI/source evidence does not claim simulator, physical-device, signing, store or provider validation.
