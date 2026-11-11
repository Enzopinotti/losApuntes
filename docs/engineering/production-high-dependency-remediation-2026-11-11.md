# Production dependency remediation — Mongoose / redirects / URI decoder

**Date:** 2026-11-11
**Base:** `main@13b45569874703b293bb484482e0ecc96d383934`
**Intent:** reduce confirmed HIGH advisories in the real production dependency graph without changing or bypassing the production audit.

## Baseline evidence

The canonical `main` production audit reported **13 HIGH** (12 low, 23 moderate, 48 total). Among the HIGHs:

| Package | Locked baseline | Targeted fix | Advisory |
| --- | --- | --- | --- |
| mongoose | 8.24.4 | 8.24.7 or newer on v8 | GHSA-gg4r-jv3p-qx3c, GHSA-8332-j7wj-wjw4 |
| follow-redirects | 1.16.1 | 1.16.2 | GHSA-mrwp-f3q8-3g9p |
| decode-uri-component | 0.2.2 | 0.5.1 | GHSA-qr28-fpjm-wq7f |

`node-forge@1.4.0` has **no published upstream patched release** for GHSA-86w9-cpqp-85rv at the time of this block. `zod@3.25.76` needs a v3-to-v4 migration to reach the fixed 4.6.6+ line; forcing an override is not a safe drop-in update. Both remain unresolved. Other advisory evidence is still required from the exact-head audit.

## Controlled changes

1. Raise `apps/api`'s direct Mongoose minimum to `^8.24.7` without changing the Nest/Mongo integration or the major version.
2. Pin `follow-redirects` and `decode-uri-component` to known fixed versions through root pnpm overrides. These affect transitive dependencies only and deliberately preserve the existing Fastify and source-map overrides.
3. Resolve `pnpm-lock.yaml` using the repo-pinned pnpm version on Node 24 in an isolated, read-only-token GitHub Actions job. Do **not** hand-edit package integrity hashes. The resolver selected Mongoose **8.24.8**, follow-redirects **1.16.2** and decode-uri-component **0.5.1**.
4. Confirm `pnpm install --frozen-lockfile --ignore-scripts` succeeds against the emitted graph. Remove the one-time workflow before review.
5. Add an in-repo test that checks every resolved copy of the targeted packages meets the patched floor and that the production audit command remains unchanged.

No change to application handlers, user permissions, API contracts, credential storage, browser behavior, package lifecycle scripts, security triage exceptions, or release gates.

## Verification and limitations

- Run `pnpm test:security-patched-dependencies` and `pnpm check` on **the same final HEAD**.
- Require the actual `pnpm audit --prod --audit-level high`, the canonical Node24 API/Web/Mobile formatting/type/lint jobs, all 10 critical-domain coverages, full Quality Gate and container smoke.
- An audit with remaining HIGH findings must continue to **fail** and block release. An audit that shows fewer findings is progress, **not** proof of a shippable build.
- Verify Mongoose runtime connectivity, auth and organization smoke after lockfile change. A new transitive release can alter behavior even when semantic-version compatibility is expected.
- Lockfile generator ran without token write access and with `--ignore-scripts`; it was removed from the final PR diff. Do not keep it as a production CI mechanism.
- No manual browser/e2e compatibility claim until tested.

**Coordination:** PR #772 independently hardens the audit triage classifier; this branch does not modify its code and should not require its merge to validate the production graph. Do not silently merge pending Dependabot major-version updates with this patch. 
