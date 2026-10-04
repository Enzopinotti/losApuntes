# Public edge and API privacy

**Canonical issue:** #80  
**Related production gate:** #48

This document separates controls owned by the API process from controls that only the public TLS/ingress layer can prove.

## 1. API-owned response privacy

The API applies a cache policy centrally in the Fastify runtime boundary.

Every API response is non-cacheable:

- unauthenticated/public response: `Cache-Control: no-store`;
- response whose request has an authenticated principal: `Cache-Control: private, no-store`.

This includes:

- normal JSON responses;
- validation/auth/application errors;
- presigned upload/download capability responses;
- OAuth authorization-start responses;
- future one-time capability/bearer responses unless a reviewed exception is introduced.

Controllers should not weaken this policy. A short-lived capability is still sensitive even if its TTL is small.

The object-byte cache contract remains separate. Private signed downloads continue to carry their own `private, no-store` response override at the storage layer.

## 2. Query-blind application logging

Fastify automatic request logging is disabled.

The explicit completion event records only:

- request/correlation id;
- HTTP method;
- Fastify route template;
- status code;
- bounded duration.

It does not record the raw request target or query string.

Therefore values such as:

- OAuth `code` / `state`;
- signed capability query parameters;
- search terms;
- future invitation/action proofs

must not appear merely because they were present in the URL.

Header/body redaction remains defense in depth and includes authorization, cookie, password, secret and token-like fields.

## 3. Per-process concurrency admission

The API has a coarse in-flight request budget:

```text
API_MAX_IN_FLIGHT_REQUESTS=256
API_ADMISSION_RETRY_AFTER_SECONDS=1
```

When the per-process budget is exhausted, new requests fail fast with:

- HTTP 429;
- `Retry-After`;
- stable code `API_CAPACITY_LIMITED`;
- request id;
- no request URL/query or payload echo.

The counter is released on normal response, request abort or request timeout.

This is a last-line process protection, not a distributed rate limiter. It deliberately does not replace the Auth abuse limiter.

## 4. Why request-rate limiting remains at ingress

A Node process cannot enforce a trustworthy global client/IP rate when:

- multiple API replicas exist;
- client identity comes through one or more proxies;
- connection floods happen before application parsing;
- an attacker can bypass a public proxy and reach the API directly.

The public ingress must therefore own the coarse availability perimeter:

- request-rate budget;
- connection/concurrency budget;
- request/body/time limits compatible with the API;
- direct API bypass prevention;
- trusted client-IP derivation from the exact proxy topology;
- 429/Retry-After behavior;
- monitoring for sustained rejection pressure.

Do not trust arbitrary `X-Forwarded-For`. The API only enables Fastify proxy trust for the configured `TRUSTED_PROXY_CIDRS`.

## 5. Public TLS/browser edge

The TLS terminator/reverse proxy is the authoritative owner for:

- HTTP -> HTTPS redirect;
- HSTS after HTTPS topology is validated;
- CSP for the delivered Web application;
- Permissions-Policy if the edge also emits it;
- TLS certificate lifecycle;
- public hostname/SNI policy;
- direct origin/API exposure;
- Web SPA cache policy.

Avoid duplicating contradictory headers between layers.

The API already emits baseline response-safety headers for direct/runtime defense:

- `X-Content-Type-Options: nosniff`;
- `X-Frame-Options: DENY`;
- `Referrer-Policy: no-referrer`;
- restrictive camera/geolocation/microphone Permissions-Policy.

HSTS is intentionally not emitted by the API because the API cannot know whether the current request actually traversed the authoritative public TLS terminator.

## 6. Edge access-log privacy

The public reverse proxy must log the normalized path, not the raw request target/query.

For nginx-like ingress, the access-log field should be equivalent to `$uri`, not `$request_uri` or another value that includes the query string.

This rule is especially important for:

- OAuth callbacks;
- presigned/signed URLs;
- future action/invitation links.

The upstream request still receives the complete query required for protocol correctness; only the persistent access-log representation is query-blind.

## 7. Web cache qualification contract

The repository provides a provider-neutral live probe for the public Web/API
pair:

```bash
RELEASE_WEB_ORIGIN=https://app.example.com \
RELEASE_API_ORIGIN=https://api.example.com \
RELEASE_EXPECTED_SOURCE_SHA=<exact-40-character-git-sha> \
pnpm release:qualify-live
```

The probe never sends credentials and rejects redirects. It requires:

- both public origins to be exact HTTPS origins without credentials, path,
  query or fragment;
- Web `/release.json` to be `available`, point to the exact API origin and
  carry the expected source SHA;
- API `/health/release` to be `available` with that same source SHA;
- API release evidence to remain `no-store`;
- the SPA shell and `release.json` to be revalidatable and not
  `immutable`;
- the shell to reference a bounded set of hashed Vite assets;
- every observed hashed asset to be `immutable` with at least one day of
  freshness.

The command emits only bounded release ids, origins, source SHA, asset count
and policy outcomes. It does not persist response bodies, query strings,
cookies or signed capabilities.

This probe proves deployed HTTP identity/cache contracts. It does **not**
replace the #83 browser rehearsal: rollback A -> B -> A must still be tested
with a real browser while its cache is warm.

## 8. Production evidence required

Repository CI proves the API-side contract only.

Before external Beta, #48/#80 still require evidence from the actual public environment for:

- HTTP -> HTTPS behavior;
- HSTS;
- reviewed CSP for the Web application;
- edge access log format proven query-blind;
- direct API bypass blocked;
- trusted proxy allowlist matching deployed topology;
- request-rate and connection budgets;
- 429 behavior through the public edge;
- a passing `pnpm release:qualify-live` result for the exact deployed SHA;
- hot-cache Web rollout/rollback behavior under #83 with a real browser;
- certificate expiry monitoring.

Do not mark those controls PASS from local Nest tests.
