# Operational health and worker readiness

**Canonical issue:** #99 (PROD-017)  
**Scope:** repository/runtime contract. External production monitoring evidence remains under #48.

## 1. Public health surface

Public unauthenticated health must be deliberately coarse.

### GET /health/live

Answers only whether the API process can respond.

```json
{
  "status": "ok",
  "service": "api"
}
```

It does not probe Mongo, object storage, SMTP or any external provider.

### GET /health/ready

Returns only:

- `ready`: required dependencies are healthy and optional capabilities probed here are healthy;
- `degraded`: required dependencies are healthy but an optional capability is unavailable;
- `not_ready`: a required dependency is unavailable.

The public payload contains only `status` and `service`. It must not enumerate dependency names, provider hosts, ports, topology, credentials, backlog, signed URLs, filenames or incident text.

HTTP semantics:

- `ready` -> 200;
- `degraded` -> 200;
- `not_ready` -> 503.

Current required dependency: Mongo.  
Current optional API capability probe: private object storage.

The storage probe is a bounded, non-destructive signed HEAD against a reserved key. A missing probe object is healthy; authentication/network/provider failures are degraded.

## 2. Operator diagnostics

Detailed checks are intentionally outside the public controller.

After building the API:

```bash
pnpm --filter @losapuntes/api health:diagnostics
```

The command prints one JSON object containing:

- overall status;
- service id;
- sanitized per-dependency checks;
- check timestamp.

It never copies provider exception messages into its output. A required dependency failure exits non-zero. `degraded` remains diagnostically visible without pretending the entire API must be restarted.

This command is an operator boundary, not an internet endpoint.

## 3. Files cleanup worker readiness

The cleanup worker has a separate health contract because its storage dependency is required for useful work even though storage is optional to API readiness.

The worker:

1. initializes the Nest application context;
2. runs bounded Mongo + storage diagnostics;
3. does not claim cleanup work when either dependency is unavailable;
4. writes an atomic health marker after a healthy iteration;
5. refreshes that marker as the loop makes progress;
6. marks itself unhealthy on dependency/iteration failure;
7. removes readiness evidence during shutdown.

The marker contains only:

- `status`;
- `checkedAt`;
- `expiresAt`.

It contains no hostnames, credentials, object keys, file metadata or error messages.

The container health command is:

```bash
node dist/files/files-cleanup.health.js
```

CI applies `compose.health.yml` on top of the local runtime definition. Therefore `docker compose --wait` requires both API readiness and worker readiness instead of treating a running PID as healthy.

## 4. Failure interpretation

### Mongo unavailable

API:

- `/health/live`: still 200 while the process can answer;
- `/health/ready`: 503 `not_ready`.

Worker:

- no new cleanup claims;
- worker health becomes unhealthy.

### Object storage unavailable

API:

- `/health/live`: 200;
- `/health/ready`: 200 `degraded`;
- non-Files product surfaces may continue operating.

Worker:

- storage is required for reclamation;
- no new cleanup claims;
- worker health becomes unhealthy.

This distinction prevents an optional Files outage from creating a restart loop for the entire API while still making the dedicated Files worker fail closed.

## 5. Logging and secrecy

Health and worker code may log only bounded event names/status values. Do not log:

- DSNs;
- credentials;
- authorization/cookie headers;
- presigned URLs;
- object keys from user files;
- email addresses;
- raw exception messages from providers.

Use the existing request id/correlation id for HTTP diagnostics.

## 6. Provider-neutral alert transition boundary

The repository includes a pure transition engine for the signals it can already
observe safely:

- `api.not_ready`;
- `api.degraded`;
- `worker.not_ready`.

The engine does not send alerts and does not choose production thresholds. A
caller must provide the activation window and repeat cooldown for each signal.
Those values must come from measured operational behavior and the real
notification/on-call design.

The transition contract is:

1. an unhealthy observation starts a pending interval;
2. no alert is emitted until the configured activation window has elapsed;
3. once active, identical observations are deduplicated until the configured
   repeat cooldown;
4. a healthy observation after activation emits one `recovery` transition;
5. a healthy observation before activation clears the pending interval without
   emitting noise;
6. observations older than the latest accepted sample cannot rewind state.

The emitted envelope is deliberately bounded to signal, phase and timestamps.
It accepts no exception message, host, credential, object key, email, request
body or provider payload.

This is the repository-owned seam for a future monitoring adapter. Pager,
email, chat, incident-management or metrics-provider wiring belongs outside
this boundary and must preserve the same privacy limits.

## 7. External production work still required

Repository health contracts and the transition boundary do **not** prove
production monitoring.

Before external Beta, #99/#48 still require real environment evidence for:

- alert routing and owner/on-call destination;
- sustained `not_ready` and `degraded` thresholds;
- worker restart-loop alert;
- disk/memory/PID pressure thresholds based on measured runtime usage;
- cleanup backlog alert;
- TLS expiry alert at the actual public edge;
- recovery evidence freshness integration with #100;
- a deliberate alert dry-run and recovery notification.

Do not manufacture PASS evidence for those controls from local CI.
