# Auth abuse controls v1

**Planning:** `PROD-008`  
**Requirement:** `PROD-FR-006`  
**Launch authority:** #48  
**Status:** Implementation carrier

## Purpose

Protect the public Identity/Auth endpoints that can amplify credential guessing, account creation, or transactional email without turning the defense itself into an account-denial primitive.

This contract depends on the production-foundation work that made Fastify client-address resolution explicit and bounded. It never parses `X-Forwarded-For` directly.

## Protected operations

V1 applies admission control before business work on:

- Web password login;
- Mobile password login;
- registration;
- verification resend;
- password-recovery request.

Token inspect/complete and authenticated account-security mutations remain protected by their existing possession/authentication contracts and are not silently folded into this policy.

## Security identity

The only network signal is Fastify `request.ip`.

When the API is direct, it is the TCP peer. When configured behind ingress, Fastify may derive it only through the explicit `TRUSTED_PROXY_CIDRS` allowlist established by the production-foundations carrier.

The limiter never reads forwarded headers itself.

Email is normalized using the same lowercase/trim contract as Auth DTOs before deriving abuse keys.

Raw IP and raw email are never stored in abuse-bucket documents. Bucket identities are keyed with HMAC-SHA-256 using a dedicated `AUTH_ABUSE_KEY_SECRET`.

## No targetable account lockout

There is deliberately **no global email/account bucket**.

Registration, verification resend and recovery request consume:

1. a stricter `origin_identifier` bucket keyed by the pair `(client IP, normalized email)`;
2. only when that pair is still admitted, a broad `origin` bucket keyed by client IP.

The pair bucket is evaluated first. Once it is exhausted, subsequent attempts for that pair do not keep draining the broader origin bucket.

Password login is intentionally different: the broad origin bucket is consumed before password verification, while the pair bucket records only `INVALID_CREDENTIALS` outcomes. A proven credential is never rejected because another actor exhausted the failure bucket for that origin/email pair.

Therefore an attacker who knows another person's email can rate-limit their own origin/email pair, but cannot consume a durable/global bucket that prevents the legitimate user from authenticating from another origin.

This does not claim resistance against a distributed botnet. Edge/WAF/provider controls remain defense-in-depth launch work.

## Fixed-window policies

V1 uses deterministic fixed windows because Mongo can enforce each counter atomically through one unique bucket key and `$inc` without a separate coordination service.

| Operation | origin | origin + identifier |
| --- | --- | --- |
| password login (Web/Mobile share one policy) | 120 / 10 min | 10 / 10 min |
| registration | 30 / 60 min | 5 / 60 min |
| verification resend | 40 / 60 min | 6 / 60 min |
| recovery request | 40 / 60 min | 6 / 60 min |

The limits are initial product-security values, not universal constants. Changing them is an operational/security decision and requires tests plus release notes.

Web and Mobile password login intentionally share the same operation namespace so switching transport does not double the guessing allowance.

## Mongo persistence

Collection: `auth_abuse_buckets`.

A bucket contains only:

- opaque HMAC bucket key;
- non-sensitive policy name;
- dimension name;
- window start/end;
- count;
- expiration timestamp.

A TTL index removes expired windows eventually. TTL cleanup is hygiene only; the unique key includes the window identity, so an expired physical row cannot affect a later window.

Concurrent increments are atomic. A duplicate-key race during first creation is retried as an increment against the winner.

No password, raw email, raw IP, session token, action token or provider credential belongs in this collection or its logs.

## Failure behavior

The limiter uses the same Mongo authority already required by Auth.

If an abuse-bucket decision cannot be persisted/read reliably:

- the public Auth operation fails with `503 AUTH_ABUSE_CONTROL_UNAVAILABLE`;
- it is **not** mislabeled as `RATE_LIMITED`;
- business work and email delivery are not attempted;
- logs may record only operation, requestId and error type.

This is an explicit fail-closed admission policy. It does not pretend that Auth remains available when its transactional database is degraded.

## HTTP contract

Rejected admission returns:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: <whole seconds>
Cache-Control: no-store
```

Body keeps the normal API envelope:

```json
{
  "statusCode": 429,
  "code": "RATE_LIMITED",
  "message": "Too many authentication attempts",
  "retryAfterSeconds": 123,
  "requestId": "..."
}
```

`Retry-After` and `retryAfterSeconds` are bounded to the current window end and never expose which dimension rejected the request.

Unknown/existing accounts receive the same admission semantics. Recovery/verification continue to preserve their bounded enumeration-resistant accepted result whenever admission succeeds.

## Secret contract

`AUTH_ABUSE_KEY_SECRET` is separate from password/session/provider secrets.

Requirements:

- at least 32 bytes/characters of high-entropy secret material in production;
- injected through the production secret mechanism;
- never logged or committed;
- the isolated local/CI stack uses an explicitly known local value;
- the production deployment profile rejects that known local value.

Rotating the secret naturally changes future bucket identities. Existing old-key buckets expire by TTL; no migration is required.

## Observability boundary

V1 may emit sanitized counters/events for:

- operation;
- dimension class;
- allowed/rejected;
- datastore unavailable.

It must not emit raw email, raw IP, bucket HMAC, password or token.

Alerting/aggregation belongs to `PROD-017`; this carrier provides the stable event vocabulary without claiming production alerts already exist.

## Verification before merge

Exact-head CI must prove:

- concurrent bucket increments cannot exceed the allowed count without rejection;
- a pair rejection does not consume the broad origin bucket;
- same email from another origin is independently admissible;
- Web + Mobile login share the password-login policy;
- unknown and existing recovery/verification identities have the same public admission behavior;
- `429 RATE_LIMITED` returns stable `Retry-After`;
- limiter persistence failure returns bounded 503 and does not invoke Auth/email work;
- untrusted forwarded headers do not create a new limiter identity when proxy trust is absent;
- configured trusted proxy behavior continues to use Fastify's resolved `request.ip`;
- runtime smoke reaches a real `RATE_LIMITED` response and then recovers after using an independent identity/origin without account-global lockout.

A green run on an earlier SHA is not merge evidence.
