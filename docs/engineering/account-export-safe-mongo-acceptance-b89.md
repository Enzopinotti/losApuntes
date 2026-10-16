# B89 — Resolved-loopback isolation for destructive Mongo acceptance

**Base:** B87 `main@ce9385456904fcd38f5e5a81509013d1a46c17bd`.  
**Release:** issue #353 OPEN/HOLD, `STUDY_PROGRESS_ENABLED=false`, no manual CI or deployment.

## Why this block is necessary

B86 added a local Mongo opt-in runner for fault injection. Its test suite creates a randomly named database and deliberately drops that database on teardown. The launcher had only checked whether the supplied URI's *literal hostname* was `127.0.0.1`, `localhost`, or `mongo`. This was insufficient as a trustworthy local-only safety gate:

- The `mongo` alias is not intrinsically loopback and may resolve to another container/host/remote Mongo instance.
- A local-looking DNS alias could include a nonloopback address in its returned results.
- The Mongo driver may resolve `localhost` again or discover a replica set member different from the original seed, permitting redirect after a successful preflight.
- Arbitrary URI options (e.g. `authSource`, `tls`, `readPreference`, `directConnection`) or an explicitly selected database were not rejected at this launcher boundary.

With a destructive acceptance suite, don't equate a textual hostname allowlist to a local-only connection guarantee.

## B89 implementation

New independently testable `scripts/testing/b89-local-mongo-uri.mjs` rejects malformed URIs before any Jest process is spawned. It requires:

1. Exactly `mongodb://` (no SRV or other protocols), no embedded username/password/fragment and no database path.
2. An explicit valid TCP port and exactly one sanitized `replicaSet` query option. All extra options and duplicated keys are rejected.
3. A candidate hostname of `127.0.0.1`, `localhost` or `::1`. The earlier ambiguous `mongo` alias is intentionally **no longer supported** in the safe runner. For a Dockerized replica set, publish/forward its intended single primary listener on the host loopback interface.
4. `node:dns/promises.lookup(..., {all:true})` must succeed and return **only actual loopback IPs**. All DNS answers are checked, including family consistency, and a single nonloopback address causes rejection.
5. To eliminate hostname re-resolution races, the validated loopback IP is **pinned into the passed Mongo URI**. `directConnection=true` is injected by the runner, preventing replica discovery from redirecting the client to an advertised member at an unvalidated hostname.
6. The launcher passes only the pinned URI to the child process, and never echoes raw connection strings on validation errors. Existing Node24 requirement, `STUDY_PROGRESS_ENABLED=false`, `--testNamePattern B86` and zero-test failure remain intact.

The application itself is not modified. The disposable Mongo spec's owner-scoping, random database name, primary/replica topology checks and cleanup remain unchanged.

## Executable regression evidence

`scripts/test-account-export-b89-local-mongo-uri.test.mjs` contains **14 real Node tests**, run locally with Node v22.16, **14/14 PASS**. Verified the exact executable file blobs against GitHub:

- `scripts/testing/b89-local-mongo-uri.mjs`: `bc0c0b07c213b7b98ad6930162d877f0d2394788`.
- `scripts/test-account-export-b89-local-mongo-uri.test.mjs`: `1094345e474a09d3a1784f45973dbe0fc9c22705`.

Positive tests include the real system resolver for a numeric loopback URI, all-loopback DNS for localhost, IPv6 loopback, pinned numeric output and direct mode. Negative tests include a misleading `mongo` alias, nonloopback IPv4/IPv6, IPv4-mapped IPv6, mixed DNS results, resolver outages, invalid family, credentials, extra options, database path, duplicate/invalid `replicaSet`, malformed port, wrong protocols and URI normalization.

An additional structural contract `scripts/test-account-export-b89-local-mongo-uri-guard.mjs` requires validation before `spawnSync`, pinned URI in the child environment and all release gates. Root `test:account-lifecycle-contract` includes both scripts, and `test:account-export-b89-local-mongo-uri` runs the deterministic vectors alone.

## Operator commands

From the repo root, execute the non-destructive validator first:

```bash
node --test scripts/test-account-export-b89-local-mongo-uri.test.mjs
```

Then, with a disposable **local** replica set already available and Node24/pnpm9:

```bash
STUDY_PROGRESS_ENABLED=false \
STUDY_PROGRESS_TEST_MONGO_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0' \
pnpm test:account-export-b86-local-acceptance
```

Do not replace the URI with a remote address, a shared database or a Docker service alias; the runner will now refuse them. If using Docker, forward the isolated Mongo primary to `127.0.0.1` and ensure the test deployment is disposable and transaction-capable.

## Limitations and release status

This is a **pre-execution trust boundary**, not evidence that a replica set or real provider S3 is present. The `directConnection=true` mode prevents automatic member discovery but requires that the chosen seed is the writable replica-set member; Mongo's spec still confirms `hello.isWritablePrimary` and `setName`. Nothing here validates production topology, TLS/IAM, backups, S3 versioning/retention or HTTP/browser E2E.

**Not executed:** full B86/B87 HTTP loopback acceptance, Jest/Mongo replica-set, Node24/pnpm9 full checks, provider S3, backup/restore and audits #133/#141. #353 remains HOLD, feature flag OFF. This block does not make the release deployable.

## Parallel coordination

#399/#400/#402/#403/#404/#405 and other current QA/format branches must preserve the B89 launcher and new local URI guard. Those branches change Mongo fixtures and API quality from various parents, so rebase exact current main and avoid overwriting the canonical B86–B87 test harness.
