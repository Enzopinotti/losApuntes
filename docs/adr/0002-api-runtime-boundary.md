# ADR 0002 — Harden the API runtime boundary before domain expansion

- Status: Accepted for the 2026 foundation
- Date: 2026-09-22

## Context

Los Apuntes has a rescued NestJS/Fastify API but its HTTP process still behaved like a development scaffold: configuration was only partially validated, Swagger was always exposed, request correlation was absent, DTO validation was not globally enforced, health semantics were undefined and unexpected exceptions could inherit framework-specific output.

The database decision is intentionally still open until the real DER/class diagrams are reconciled. Runtime hardening therefore must not turn the current Mongo implementation into a permanent architecture decision.

TOP already has mature HTTP-boundary rules. We reuse the principles that are valuable at Los Apuntes scale without copying its module/runtime complexity.

## Decision

### Request boundary

The Fastify adapter explicitly configures:

- server-generated UUID request IDs;
- inbound request IDs are not trusted as authority;
- a 120 second request receive timeout;
- a 1 MiB global JSON/body limit;
- prototype and constructor poisoning rejection;
- forwarded client-address headers are untrusted by default;
- `trustProxy` becomes active only from the explicit `TRUSTED_PROXY_CIDRS` IP/CIDR allowlist; an empty allowlist is equivalent to `false`.

Large files will not justify increasing the global body limit. Files/Notes will use a dedicated direct-to-object-storage design later.

### Validation

Nest global validation:

- transforms DTO inputs;
- allow-lists decorated DTO properties;
- rejects unknown fields;
- suppresses validation target/value echo.

### Error contract

Unexpected 5xx errors are sanitized. The client receives a stable envelope:

```json
{
  "statusCode": 500,
  "code": "INTERNAL_SERVER_ERROR",
  "message": "Internal server error",
  "requestId": "..."
}
```

Stack traces, connection strings and raw provider/database error messages are not client API.

Controlled 4xx errors preserve bounded client-facing validation/error messages inside the same envelope.

### Correlation and logging

The server-generated request ID is the root correlation identifier for synchronous work.

Every response carries `x-request-id`. Fastify automatic request logs are disabled and the runtime emits one bounded structured completion event per request. Unexpected failures may emit one additional diagnostic containing identifiers/status/error type, never request bodies or secret values.

Logger redaction is defense in depth. It is not permission to log arbitrary request/domain objects.

### CORS

Browser CORS is enabled only when `WEB_ORIGIN` is configured as one valid HTTP(S) origin.

- wildcard origin is not accepted;
- credentials are permitted for the future cookie-session model;
- methods are explicitly bounded.

Native mobile clients are not governed by browser CORS.

### Health

`GET /health/live` answers only whether the API process can respond. It never checks Mongo or another remote provider.

`GET /health/ready` currently treats the rescued Mongo connection as a required dependency and performs a bounded, sanitized ping. A failure returns HTTP 503 with `not_ready`.

Mongo being the current readiness dependency does not settle ADR 0003/persistence. If persistence changes, the readiness composition changes with it.

### Lifecycle and Swagger

SIGINT/SIGTERM shutdown hooks are enabled so Nest/Fastify can close cleanly.

Swagger remains available for development but is disabled by default when `NODE_ENV=production`. Production exposure requires explicit `SWAGGER_ENABLED=true`.

## Deliberately deferred

- IP rate limiting;
- provider/ingress-specific proxy allowlist values;
- Redis/distributed buckets;
- OpenTelemetry/tracing vendor integration;
- Auth/session redesign;
- file upload transport;
- DB migration.

IP throttling remains deferred because enabling `trustProxy` without an authoritative proxy topology can make forwarded client addresses spoofable, while keeping it false would often bucket every user behind the reverse proxy as one peer.

## Consequences

### Positive

- every API failure is diagnosable by request ID without leaking internal failure text;
- deployment probes get distinct liveness/readiness semantics;
- DTO boundaries reject silent over-posting;
- Swagger exposure becomes intentional;
- future Web/Mobile clients get one stable runtime error shape.

### Trade-offs

- readiness is temporarily Mongo-specific while the rescued persistence implementation remains active;
- the global 1 MiB limit means future file work must use the dedicated Files architecture rather than posting large binaries through controllers;
- rate limiting waits for deployment topology evidence, but the runtime now has a fail-safe proxy allowlist contract so later IP controls can use a reviewed client-address authority instead of arbitrary forwarded headers.
