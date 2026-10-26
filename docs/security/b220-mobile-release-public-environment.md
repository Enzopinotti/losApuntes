# B220 — Mobile release public environment preflight (Expo SDK 57)

**Baseline:** `main@fb52a1d681d26767d1aa2402438bf9e1954157a7`, 2026-10-25.  
**Lane:** Agente A (integration, security and release acceptance); distinct from #709–#716.  
**Decision:** Draft / HOLD. No release, no merge until mandatory checks are green.

## Defect / why this is necessary

The exact-head Mobile iOS/Android Expo Metro export in [B219 #716](https://github.com/Enzopinotti/losApuntes/pull/716) succeeded with **no `EXPO_PUBLIC_API_ORIGIN` defined** in its GitHub workflow. Compiling a JS/Hermes bundle is not equivalent to a usable app: `apps/mobile/src/config/runtime.ts` throws at startup when `EXPO_PUBLIC_API_ORIGIN` is missing. `release-runtime.ts` also consumes `EXPO_PUBLIC_RELEASE_SHA` and `EXPO_PUBLIC_DISTRIBUTION_PROFILE`. A future distributed candidate must establish these **at build time** and preserve the server-observation acceptance separately.

Public Expo env values are deliberately substituted into client bundles: accidentally naming a secret `EXPO_PUBLIC_*` would expose it to users. The checker controls the **names** of admitted public build variables; it cannot inspect a developer's intent or prove that a legitimate-looking value was not a secret.

## Contract

`node scripts/security/check-mobile-release-public-env.mjs "$CANDIDATE_HEAD_SHA"` must pass **before** producing any preview/production native bundle:

1. `EXPO_PUBLIC_API_ORIGIN` is present, canonical HTTPS, a plain origin without userinfo, query, fragment or path. Reject HTTP, loopback/local/private IP literal targets and reserved `example`/`test`/`invalid` fixture hosts. Check syntax only: cannot prove DNS, TLS deployment, or the API's current health.
2. `EXPO_PUBLIC_RELEASE_SHA` is exactly the immutable 40-hex source SHA being built. Wrong, empty, abbreviated or invented values fail.
3. `EXPO_PUBLIC_DISTRIBUTION_PROFILE` is **preview** or **production**, never `development` or arbitrary strings. Local development can continue using `apps/mobile/env.example` without invoking this distributed-release contract.
4. `EXPO_PUBLIC_*` is an allowlist: API origin, SHA, profile, three optional public Google OAuth config fields and the two existing optional native study feature flags. Unknown keys are refused before Expo can embed accidental tokens, passwords, private keys or Google client secrets. The optional Google iOS Client ID and URL scheme must be configured together. Study flags accept only explicit `true` or `false` when present.
5. `STUDY_PROGRESS_ENABLED=true` is rejected by this integration gate while issue [#353](https://github.com/Enzopinotti/losApuntes/issues/353) remains HOLD. **The backend gate continues to be authoritative**; this is not a substitute for server enforcement.

The JSON result never includes URLs, credentials, environment values or secrets. It always reports `productionAuditCertified:false`, `serverReleaseObserved:false`, `nativeBinaryValidated:false`, `releaseAuthorized:false`. Build environment validation is **not** release authorization.

## How to use it for a real candidate

From the repository checkout of the **exact target commit** (Node24, pnpm9), provide the actual reviewed HTTPS API origin, exact candidate SHA and distribution profile using your secure build environment; never commit a `.env` containing release credentials. Then:

```sh
node scripts/security/check-mobile-release-public-env.mjs "$(git rev-parse HEAD)"
pnpm --filter @losapuntes/mobile exec expo export --platform ios --output-dir dist-ios
pnpm --filter @losapuntes/mobile exec expo export --platform android --output-dir dist-android
```

The export commands alone do not prove native build identity or device behavior. The independent B219 both-platform artifact check, native builds, actual `GET /health/release` observation (matching source SHA and API origin), two-account acceptance, backup/restore, and mandatory production audit remain necessary. The B220 script should be **composed before** B219's bundling step as soon as the new policy is integrated; otherwise B219 continues to prove only that blank-environment bundles compile. B220 does not modify another agent's open B219 PR.

## Exact-head CI proof

`.github/workflows/b220-mobile-release-public-env.yml` checks both explicit failure (missing API origin) and a **synthetic** well-formed build environment, plus independent negative tests for HTTP, local IPs, userinfo, path escapes, wrong SHA, unknown public variables and incompatible OAuth flags. The synthetic URL is intentionally **not an operational production API**; passing it exercises the validator only. No secrets, deployment, native signing, browser/API requests or package version changes occur.

## Remaining security blockers

The root mandatory `pnpm audit --prod --audit-level high` still finds HIGH `node-forge@1.4.0` (issue #133, GHSA-86w9-cpqp-85rv) and `zod@3.25.76` (issue #705, GHSA-mrhx-c7xc-m3w5). The upstream node-forge advisory lists no patched version. The Zod advisory is patched in v4.6.6, but forcing Zod 4 into Expo CLI's Zod 3 consumer without compatibility verification is unsafe. Do not add overrides or waivers. Release #353, Study Progress flag and all unmerged PRs remain HOLD.
