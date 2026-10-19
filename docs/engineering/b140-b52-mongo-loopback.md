# B140 — Study Collections B52 Mongo acceptance destination hardening

**Base:** `main@bc8239e56ec9cb98364acefdd4960ebc117b4032` (B138).  
**Scope:** test runner / acceptance guard only; not application permissions, persistence or flags.  
**Release:** #353 remains HOLD; #133 and #141 are independent supply-chain blockers.

## Risk found

The legacy `validateStudyMongoGateUri` accepted the unverified `mongo` alias and permitted arbitrary URI options and ports. Its runner then launched a Mongo test suite that creates and drops an ephemeral database. By contrast, B89 already protects destructive acceptance by resolving all DNS results, requiring true loopback, pinning a numeric destination and forcing a direct connection so a replica-set advertisement cannot redirect the driver. The historical B50 fixture accepted only the one-option `replicaSet=rs0` URI and therefore did not accept B89's safe normalized URI.

## Implemented contract

1. Reuse `validateB89LocalMongoUri` as the single network preflight. The legacy B52 runner awaits validation **before spawning Jest**. It accepts only a pinned `127.0.0.1:27017` replica `rs0` and forwards `directConnection=true`.
2. The B50 fixture accepts exactly one or two permitted options: `replicaSet=rs0`, optionally `directConnection=true`, with no duplicates. A direct Mongo connection is forced in Mongoose's connection options even for the standalone B126 route.
3. Keep the existing real `hello`/PRIMARY/advertised-members inspection, unique scratch database, cleanup fence, exact 13 required names and skip/failure rejection.
4. Unit regression vectors reject `mongo` alias, non-local/poisoned DNS, credentials, arbitrary databases/ports/options, conflicting directConnection and absent replica settings.
5. PR-only read-only CI checks the candidate SHA, Node syntax, B89 and B52 contract vectors, canonical API formatting, zero-warning fixture ESLint, whole API TypeScript, and the actual 13-case isolated Mongo 7 replica test via the fail-closed B52 runner.

## Acceptance evidence

**Not yet certified on this candidate.** The PR's current head and GitHub Actions jobs must be checked after all changes. Passing a pure validator test does not count as executing Mongo acceptance; completing 13 Mongo assertions does not count as production readiness or a supply-chain audit.

This intentionally does not alter application code, feature flags, dependency policies, S3 upload/download behavior, user credentials or the B139 study-plan import.
