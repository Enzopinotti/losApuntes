# B219 — Exact-head Expo SDK 57 Mobile export preflight

**Baseline:** `main@fb52a1d681d26767d1aa2402438bf9e1954157a7` on 2026-10-25.  
**Status:** Draft / release HOLD; this is build acceptance, not an advisory fix.

## Purpose

Mobile uses Expo SDK 57, React Native 0.86, and a frozen pnpm 9 lockfile. Its transitive CLI toolchain currently contains `node-forge@1.4.0` (GHSA-86w9-cpqp-85rv, #133) and `zod@3.25.76` (GHSA-mrhx-c7xc-m3w5, #705), both HIGH in the mandatory production dependency audit. The Zod advisory identifies `4.6.6` as the first patched major-4 release. Do **not** silently force a major-4 transitive override into SDK 57's major-3 consumer. Node-forge <=1.4.0 has no upstream patched release identified as of this baseline. Expo CLI SDK-57 patch updates exist, but a patch release alone is not evidence that both advisories are resolved.

A safe compatibility migration needs a repeatable proof that the Mobile code can generate both **iOS and Android native JavaScript/Hermes bundles** on the exact future lockfile, before package updates are considered for integration. This PR adds that proof without changing any manifests, package versions, node-forge, Zod, config, runtime services, or source code.

## New acceptance

- `scripts/security/verify-expo-native-export.mjs`: verify native export `metadata.json` reports Metro and both `android` and `ios` bundles; check exact relative bundle paths within `_expo/static/js/<platform>`, actual file existence and nonzero size, SHA-256 per file, deterministic inventory digest, max 5,000 files and 512 MiB total.
- Fail closed on symlinks, traversal/absolute/Windows paths, duplicate paths, missing platform, missing metadata, unexpected formats, empty bundles and filenames that reveal signing credentials, `.env`, Google service files or service-account material. Never log file contents or include credentials in output.
- The output includes explicit `productionAuditCertified:false` and `releaseAuthorized:false`, irrespective of bundle success. An SHA-256 inventory is an artifact integrity record, **not** a signature or attestation.
- Test fixture is wholly local and disposable, including both-platform metadata, sorting stability, malformed references, forbidden secret filenames, byte budget and filesystem symlink defenses.
- Dedicated `B219` GitHub workflow pins exact PR head / Node24 / pnpm9, installs `--frozen-lockfile`, enforces no audit waivers, checks Mobile TS and tests, runs **actual Expo production export for both native platforms**, verifies artifacts, then confirms source SHA and clean working tree. `CI` and `EXPO_OFFLINE` avoid interactive logins/network updates. Never publishes artifacts, signs builds, uploads secrets or deploys.

## Proof boundaries

This **does** cover Metro's exact-head native bundle and packaging paths for both iOS and Android, plus static asset inventory. This **does not** create an actual `.ipa` or `.apk`, compile native Xcode/Gradle code, exercise signing credentials, certify two-device auth, prove exploitation is impossible, or fix either HIGH finding. Real device builds, integration/security audits, legal/backup acceptance and native release signing remain separate.

## Coordination

B219 creates only a dedicated `scripts/security/verify-expo-native-export*` pair, a B219 workflow and this document. It does not touch the B195 root lock risk graph (#709), AUDIT01 runner (#711), Auth browser (#712), Study export (#713), HTTP Auth (#714), or installed API runtime audit gate (#715). It is an isolated staging lane for **future reviewed Expo SDK 57 patch and/or major version migration**.

The canonical production audit `pnpm audit --prod --audit-level high` remains mandatory; the build preflight is not a waiver. Keep issue #133 and #705 OPEN and all PRs HOLD until the advisories are actually resolved in the live lockfile and full exact-head global gates pass.

**Release decision:** HOLD / NOT MERGED / NOT DEPLOYED. `STUDY_PROGRESS_ENABLED=false`.
