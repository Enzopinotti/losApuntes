# Production resilience contract

**Canonical issue:** #87  
**Related:** #48, #83, #99, #100  
**Status:** repository-owned resilience contract; real production measurements and scanner deployment remain external evidence.

## 1. Principle: measured before limits

CPU, memory, PID, temporary-space and graceful-stop limits are not product constants. They are chosen from observed runtime behavior on the deployment class that will actually host Los Apuntes.

The repository therefore does not ship invented production numbers.

Before using `compose.resilience.yml`, produce a non-secret JSON evidence file and validate it:

```bash
export PRODUCTION_RESILIENCE_EVIDENCE_FILE=/srv/losapuntes-evidence/resilience.json
pnpm resilience:check
pnpm resilience:compose-env > /srv/losapuntes-evidence/resilience.env
```

The generated env file contains only resource/log limits. It contains no provider credentials or signed URLs. Production secrets continue to come from the external secret mechanism.

## 2. Required measurements

Evidence version 1 records host capacity plus measurements for `api` and `files-worker`:

- measurement window and sample count;
- peak CPU cores;
- peak resident/container memory bytes;
- peak PID count;
- maximum observed graceful drain time.

The selected limit for each dimension must be at least the observed peak and must remain below the measured shared-host capacity. The repository deliberately does not impose a universal safety multiplier.

The tmpfs limit must remain below the service memory limit because tmpfs consumes memory under the same cgroup.

## 3. Deployment overlay

`compose.resilience.yml` is an overlay, not a standalone production topology.

It requires explicit values for CPU, memory, PIDs, `/tmp` tmpfs, stop grace period, and bounded container log rotation.

It also uses SIGTERM and `init: true`.

```bash
pnpm resilience:check
pnpm resilience:compose-env > /srv/losapuntes-evidence/resilience.env

docker compose \
  --env-file /srv/losapuntes-evidence/resilience.env \
  -f <deployment-base.yml> \
  -f compose.resilience.yml \
  config
```

The deployment base remains environment-owned because DNS, providers, volumes, secrets and network policy are external inputs.

## 4. Log retention

Container logs must be bounded. For each service, evidence records measured peak bytes/hour, required diagnostic window, driver, max-size and max-file.

The validator requires configured rotation capacity to cover at least the measured peak rate multiplied by the chosen diagnostic window. The diagnostic window is an operational decision; CI does not invent it.

## 5. Graceful replacement

The API already enables Nest shutdown hooks for SIGINT/SIGTERM. The Files worker stops new loop iterations on SIGTERM, aborts sleep, finishes the active bounded iteration and closes its Nest context.

The deployment overlay supplies an explicit stop grace period that must be at least the maximum measured drain time.

Replacement must remove the instance from new traffic/readiness, send SIGTERM, allow the measured grace period, use SIGKILL only after that bound, and verify the replacement before discarding rollback material.

## 6. Rollback vs data recovery

**Application rollback** starts a previously accepted application image against data that remains compatible.

**Data recovery** restores durable Mongo + Files state under #100.

They are not interchangeable.

Every release declares either `n-1` compatibility or `forward-only`. Forward-only cannot claim application-only rollback; it requires explicit recovery-required data semantics.

A schema-sensitive release cannot claim `n-1` merely because an old image still exists.

## 7. Release retention

Retention protects the exact current image digest and exact accepted rollback image digest. Evidence also declares a bounded maximum retained-image count and `globalPruneAllowed=false`.

Routine cleanup must select only Los Apuntes release material outside the protected rollback set. Never use indiscriminate global prune as the routine retention mechanism.

The repository does not auto-delete host images because registry/runtime ownership is deployment-specific.

## 8. Files scanner boundary

PR #127 completed repository-owned quarantine and includes a ClamAV adapter. That does not prove production scanner readiness.

Before broad untrusted-file sharing, #87 still requires real scanner deployment, connectivity, 50 MiB-compatible stream limits, representative CPU/memory/PID measurement, privacy-safe failure monitoring, and an outage/restart drill proving quarantine remains fail-closed.

The Files worker now probes the configured scanner on every bounded worker iteration even when the scan backlog is empty. A failed or timed-out probe marks the private worker health marker `not_ready` and emits only the sanitized `scannerStatus`; the scanner host, port, response body, filenames, object keys and raw bytes are never written to that health event. Public API `/health/ready` remains scoped to API authority/dependencies and does not expose scanner topology.

## 9. Relation to release qualification

#83 may consume validated resilience evidence with exact SHA/image identity, but a PASS from `pnpm resilience:check` means only that the evidence is internally coherent.

It does not prove that measurements were honest, the deployment applied the overlay, external alerting exists, scanner production readiness exists, or recovery drill/RPO/RTO under #100 passed.
