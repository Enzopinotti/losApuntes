# Dependency audit exceptions — B132 removal

**Current policy:** no active exceptions. **Release:** HOLD. **Source:** [#133](https://github.com/Enzopinotti/losApuntes/issues/133), [#141](https://github.com/Enzopinotti/losApuntes/issues/141), [#353](https://github.com/Enzopinotti/losApuntes/issues/353).

## Removed on B132

The temporary node-forge waiver for CVE-2026-85393 / GHSA-86w9-cpqp-85rv expired on **2026-10-15T00:00:00Z**. B132 removes the obsolete entry from `security/audit-exceptions.json` and removes `pnpm.auditConfig.ignoreCves` from the workspace manifest. The expiry is not prolonged and no new CVE, GHSA, package, scope or version is exempted.

`pnpm security:audit-exceptions` now verifies that the policy contains **exactly zero exceptions** and the root manifest has **no `pnpm.auditConfig`**. The dedicated Node test rejects legacy/re-dated exceptions, targeted/blanket CVE and GHSA ignore entries, malformed policy and unknown fields. Release qualification independently fails closed when exceptions or ignore lists reappear.

## What remains vulnerable and blocked

The monorepo production graph still includes the Expo/Metro toolchain, including:

- `node-forge@1.4.0`, CVE-2026-85393 / GHSA-86w9-cpqp-85rv ([#133](https://github.com/Enzopinotti/losApuntes/issues/133)).
- `braces@3.0.3`, CVE-2026-93687 / GHSA-vfj7-8cjw-p6xm ([#141](https://github.com/Enzopinotti/losApuntes/issues/141)).

At B132 design review the reviewed advisories listed no patched release. **Neither vulnerable package has been remediated by changing this policy.** Without a reviewed upstream fix or dependency removal, `pnpm audit:prod` is expected to remain red with the affected advisories now unignored. Inspect its **actual exact-head output**; the policy checker is not the audit.

## Quality and release semantics

- `pnpm check` checks product quality, including the no-waiver policy regression. It does **not** replace `pnpm audit:prod`.
- `Production dependency audit` remains a separate mandatory failed release gate until the graph is actually corrected and audited on the candidate SHA.
- A passing `security:audit-exceptions` means **zero ignored advisories**, not zero vulnerabilities.
- `scripts/release/candidate-evidence-lib.mjs` still requires exact-SHA `productionDependencyAudit: PASS` evidence; none of this change can promote `#353` to GO.
- The filtered API Docker pnpm-store boundary still checks that neither vulnerable tooling package enters API runtime, independent of the full monorepo production audit.

Do not mark security, production, the release, external S3/browser tests or Study Progress as ready. `STUDY_PROGRESS_ENABLED=false`; no deployment is authorized.

## Resolution

Only close #133/#141 after a verified patched upstream version or reviewed graph removal, `pnpm install --frozen-lockfile`, exact-head production audit, applicable Mobile signing/build verification, and release evidence. Do not add unreviewed forks, overrides or new exceptions to make the gate appear green.
