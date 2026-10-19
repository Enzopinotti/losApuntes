# B141 — Fail-closed npm multi-advisory audit triage

**Base:** `main@485b2528df8c5df1c2d58bc7e09a5dece5d4abf6` (B139).  
**Scope:** security diagnostic quality only; no change to dependency versions, exceptions, permissions, production flags or deployment.  
**Requirements:** PLAT-NFR-001, PLAT-FR-007, NFR-SEC-001 — technical correction; no functional product change.

## Existing dependency blockers (verified on B140 head)

GitHub [verify #39291983765](https://github.com/Enzopinotti/losApuntes/actions/runs/39291983765) passed Quality Gate, ten critical domain coverages and container smoke. Production audit independently **failed** with 2 highs, 0 critical, related to issue [#133](https://github.com/Enzopinotti/losApuntes/issues/133) (`node-forge`) and issue [#141](https://github.com/Enzopinotti/losApuntes/issues/141) (`braces`). The code cannot declare that those upstream issues are patched or close the launch gate by improving the diagnostic.

## Specific failure mode

Legacy pnpm audit JSON can expose `advisories` with one direct finding per entry. New npm audit JSON exposes `vulnerabilities` keyed by package, where **one package may contain several advisory objects** in `via`. The prior code selected the first `via` URL and discarded subsequent findings. A known first high could therefore conceal an additional high under the same vulnerable package in the diagnostic summary, even though production audit itself remained red.

## Corrected invariant

- Keep package-level severity accounting consistent with npm `metadata.vulnerabilities` counts; never count several via entries as several packages.
- Inspect **every relevant high/critical direct via advisory**; skip explicitly lower-severity direct findings when identifying the package's high blocker.
- Keep known issue numbers when evidence matches the exact package, severity and unique GHSA identifier, but also report `UNREVIEWED_HIGH_OR_CRITICAL` when **any** high/critical via is unfamiliar, malformed or conflicts with another ID.
- Treat contradictory GHSA references within one entry as unknown, not known.
- Legacy pnpm `advisories` and npm single-via inputs remain accepted. Missing reports, invalid metadata, mismatched counts and new critical findings are not classified as clean.
- All diagnostic outputs explicitly set `productionAuditCertified:false`. `REVIEW_REQUIRED` (zero highs) is **not** a launch approval.

## CI and acceptance

Read-only `b141-production-audit-triage.yml` checks the exact PR SHA with Node 24, syntax, adversarial parser regression cases and zero-exception policy. The root `verify` pipeline still independently runs `pnpm audit --prod --audit-level high`; it must **continue to fail** until the underlying vulnerabilities disappear through reviewed upstream changes.

**No readiness promotion:** issue #353 HOLD; #133 and #141 OPEN. Do not automatically merge this block while a global release gate is failing. Do not reintroduce expired audit exceptions, forks or unreviewed overrides.
