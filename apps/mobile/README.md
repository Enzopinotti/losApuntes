# Mobile

Los Apuntes Mobile is a first-class native product built with Expo SDK 57 / React Native 0.86.

Current carrier: #49 under #7.

## Local start

1. copy `.env.example` to `.env.local` and point `EXPO_PUBLIC_API_ORIGIN` at a reachable API origin;
2. run `pnpm install` from the repository root;
3. run `pnpm --filter @losapuntes/mobile start` for JS iteration;
4. use a development/release build for SecureStore, native provider and deep-link acceptance.

The opaque Los Apuntes mobile session credential is stored only in `expo-secure-store`. Do not add AsyncStorage/MMKV persistence for authentication.

See:

- `docs/adr/0006-mobile-expo-native-foundation.md`;
- `docs/mobile/auth-v1.md`.
