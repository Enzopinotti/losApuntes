# B218 — API runtime exclusion of Zod HIGH from Expo toolchain

**Date:** 2026-10-25. **Exact base:** `main@fb52a1d681d26767d1aa2402438bf9e1954157a7`.  
**Release status:** Draft / HOLD; this containment proof does NOT fix the vulnerability.

## Problem / value

The production dependency audit sees `zod@3.25.76` (GHSA-mrhx-c7xc-m3w5, HIGH, #705) in the Expo/CLI Mobile toolchain. Another HIGH is `node-forge@1.4.0` (#133, GHSA-86w9-cpqp-85rv). The existing Docker API runtime guard already prohibited `braces` and `node-forge`, but did not include Zod. As a result, an accidental future dependency leak into the API production image might not be rejected by that guard.

B218 extends the **existing, already executed, production Docker `node_modules/.pnpm` store inspection** to reject the exact `zod@` package name, independent of version and peer suffix. This is a deliberately conservative review boundary: even a future patched Zod version requires explicit API-runtime dependency review before use. Similarly named `zod-to-json-schema` remains allowed. This does NOT prove that all callers of Zod are vulnerable; it only establishes that the currently isolated Expo toolchain does not silently enter the API runtime.

## Implementation and regression evidence

- `scripts/security/check-api-runtime-dependency-boundary.mjs`: enforce `braces`, `node-forge`, and `zod` absence from the **actual filtered production API install**. Keep required API packages `@nestjs/core`, Fastify and Mongoose; reject incomplete or malformed inventories. Explicit return fields `productionAuditCertified: false`, `releaseAuthorized: false` prevent mistaken reuse of a passing scope check as approval.
- `scripts/security/check-api-runtime-dependency-boundary.test.mjs`: original cases plus Zod 3.25.76, Zod peer suffix, Zod >=4.6.6 pending review, helper-name non-collisions, unchanged Dockerfile positioning after `pnpm install --frozen-lockfile --prod --filter @losapuntes/api...`.
- `.github/workflows/b218-api-runtime-zod-boundary.yml`: exact-head Node24 built-in unit tests and no-exception policy plus a second job that **builds the actual API production Docker target from frozen pnpm lockfile**; the Dockerfile executes the production check itself before completing. No production secrets or deployed infrastructure needed.

## Related independent controls and integration lanes

- [#709](https://github.com/Enzopinotti/losApuntes/pull/709) B195 checks API/Web/Mobile reachability in the root pnpm-lock graph; that is a distinct check and separate reviewer-owned PR, not a replacement for installed production image inspection.
- [#711](https://github.com/Enzopinotti/losApuntes/pull/711) AUDIT01 hardens the reliability and fail-closed behavior of the authoritative production audit; no shared files changed.
- [#712](https://github.com/Enzopinotti/losApuntes/pull/712) Auth Chromium smoke; [#713](https://github.com/Enzopinotti/losApuntes/pull/713) B192 Study Progress; [#714](https://github.com/Enzopinotti/losApuntes/pull/714) B217 HTTP authority: no overlap with B218.
- Main canonical `.github/workflows/ci.yml` remains unchanged; production dependency audit remains **mandatory** and fully independent.

## Release and review rules

**Do not merge or deploy because this focused guard passes.** The root `pnpm audit --prod --audit-level high` still finds upstream high-severity `node-forge` and `zod` advisories, so release stays on HOLD. B218 does not modify `pnpm-lock.yaml`, Expo, package versions, npm advisory policies, `security/audit-exceptions.json`, production Auth or `STUDY_PROGRESS_ENABLED=false`. It does not provide a fix for Mobile toolchain exposure or certify native signing flows. The historical issue #133 remains open and Zod #705 remains open until a reviewed upstream fix/migration and real Expo build tests make the mandatory audit pass.

Review criterion: both B218 exact-head jobs (including real Docker runtime build) and global quality/coverage jobs should pass before considering merging. No waived HIGH/CRITICAL gate.
