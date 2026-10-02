# Dependency audit exceptions

**Status:** security control  
**Tracking issue:** #133

Los Apuntes does not use a permanent or blanket "ignore unfixable vulnerabilities" policy.

An exception is accepted only for an exact vulnerability, exact package/version, reviewed dependency path and short expiry. CI must fail if the graph changes or the exception expires.

## Active exception

- CVE: `CVE-2026-85393`
- GHSA: `GHSA-86w9-cpqp-85rv`
- package/version: `node-forge@1.4.0`
- discovered: 2026-10-01
- expires: 2026-10-15T00:00:00Z
- tracking: #133
- reviewed parents: `@expo/cli`, `@expo/code-signing-certificates`
- API direct dependency: no
- Web direct dependency: no

At discovery time there is no released patched upstream node-forge version. This exception is temporary containment; it is not a claim that build/signing tooling is harmless or production-qualified.

## Enforcement

`scripts/security/check-audit-exceptions.mjs` runs before the production audit and under the repository test contract.

It fails if the exception expires, the pnpm ignore list differs, node-forge becomes direct in API/Web/Mobile, the version changes, the parent graph changes, or the package becomes a direct workspace importer.

The production audit still runs at `high`; only this one exact CVE is tolerated temporarily.

## Removal

When upstream or Expo resolves the graph, remove the pnpm ignore, delete the policy entry, run exact-head production audit + Mobile verification, and close #133 with replacement-version evidence.
