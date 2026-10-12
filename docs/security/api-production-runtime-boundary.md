# API production dependency boundary — focused runtime assertion

**Status:** build-time security control, not a production audit waiver.

**Tracking:** [#141](https://github.com/Enzopinotti/losApuntes/issues/141) (`braces`), [#133](https://github.com/Enzopinotti/losApuntes/issues/133) (`node-forge`)

## Why this exists

The full monorepo production audit includes Expo/Metro tooling. As of 2026-10-12, it still reports `braces@3.0.3` / GHSA-vfj7-8cjw-p6xm (high) with no published patched version. It also reports `node-forge@1.4.0` / GHSA-86w9-cpqp-85rv under the **existing exact scoped exception**, due to expire **2026-10-15T00:00:00Z**.

The API production Docker image installs a separate filtered graph with:

`pnpm install --frozen-lockfile --prod --filter @losapuntes/api...`

It must not accidentally import these known Expo build/signing dependencies into its installed API runtime graph.

## Enforced checks

`scripts/security/check-api-runtime-dependency-boundary.mjs` executes **during the API runtime Docker image build, after the filtered install**:

- Require an actual pnpm store with expected API production packages (Nest core, Fastify, Mongoose); absence/incomplete installation fails closed.
- Reject any installed pnpm store entry named `braces@*` or `node-forge@*`, irrespective of installed version.
- Require the expected `@losapuntes/api` workspace manifest so this cannot accidentally claim another build context as the API.
- Emit a bounded JSON success event containing package count and absent package names, **no tokens, dependency paths, environment secrets or signed URLs**.
- Remove the check script from the final image layer after successful execution.

The assertion is checked under `pnpm test:resilience-contract` with positive, negative, invalid-install and Dockerfile-wiring cases. The runtime image build provides the real installed-store evidence; unit tests alone cannot prove a built image is clean.

## Limits and release gate

**This is not a workaround for either CVE.** A pass establishes only that the named packages are absent from the filtered API production pnpm store at image-build time. It does not audit other API dependencies, OS image packages, Metro during Mobile builds, signing tools, the Web distribution, deployed images or external services.

`pnpm audit:prod` must continue to run and **must continue to report the open high-severity `braces` finding**. No `braces` waiver, fork or override is introduced. The `node-forge` exception remains governed independently by `security/audit-exceptions.json`, its exact package/CVE/parents and hard expiry.

For each release candidate, record:

- exact source SHA, image digest and successful API image-build evidence;
- this assertion's bounded event or a build failure;
- unmodified full production audit outcome with issues #141 and #133;
- separately, whether Mobile and providers have passed device, signing and deployment acceptance.

When an upstream patch or reviewed dependency removal becomes available, remove the affected dependency or its existing exception **only after exact-head audit and relevant Mobile/API build tests**. Never infer from this assertion that the overall release is security-qualified.
