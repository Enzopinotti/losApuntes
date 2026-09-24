# Production abuse controls v1

**Planning key:** `PROD-008`  
**Requirement:** `PROD-FR-006`  
**Parent readiness gate:** #48  
**Depends on:** `PROD-006` / `PROD-007` trusted client-IP authority, merged by #71.

## Goal

Protect sensitive public/authentication endpoints with real multi-instance rate
limits while avoiding an attacker-controlled account lockout.

The v1 contract produces the stable API outcome:

- HTTP `429`;
- `code = RATE_LIMITED`;
- integer `retryAfterSeconds`;
- HTTP `Retry-After`.

## Non-goals

This carrier does not claim to provide:

- CDN/WAF/bot-management configuration;
- CAPTCHA;
- device fingerprinting;
- permanent account lockout;
- IP reputation feeds;
- adaptive ML detection;
- provider-specific edge rules.

Those remain layered production controls, not substitutes for application limits.

## Authority and privacy

The application may use `request.ip` only because #71 established an explicit
Fastify `trustProxy` allowlist. With no trusted proxy configured, forwarded
headers are not client-IP authority.

Raw IP addresses, emails and action tokens are **not persisted** by abuse
controls.

Every persisted limiter identity is HMAC-SHA-256 using
`ABUSE_CONTROL_HMAC_SECRET`. The secret is required runtime configuration.
The known local development value is rejected under
`DEPLOYMENT_PROFILE=production`.

## No target-only lockout

A public email/account target is never a limiter key by itself.

When a target dimension is useful, the persisted dimension is derived from:

```text
client IP + normalized target
```

Therefore an attacker on network A cannot consume the target-specific allowance
for the same account from network B.

There is also no durable `User.lockedUntil`, failed-login counter on User, or
other account state that can be driven by unauthenticated traffic.

## Storage semantics

Limiter windows live in MongoDB so all API instances share one authority.

A window record contains only:

- opaque HMAC key;
- non-sensitive policy/scope label;
- counter;
- window start;
- expiry.

Consumption is one atomic `findOneAndUpdate + $inc + upsert`. A TTL index
removes expired windows. The decision is based on the returned counter, so
concurrent API instances cannot each grant their own independent allowance.

## Policies

Policies are intentionally reviewable code constants for v1. Changing them is a
behavior change and must pass the same evidence path.

| Scope | Dimensions | Limit | Window |
| --- | --- | ---: | ---: |
| auth login (Web + Mobile together) | IP | 30 | 5 min |
| auth login | IP + email | 5 | 5 min |
| registration | IP | 12 | 60 min |
| registration | IP + email | 3 | 60 min |
| email verification request | IP | 20 | 60 min |
| email verification request | IP + email | 5 | 60 min |
| password recovery request | IP | 20 | 60 min |
| password recovery request | IP + email | 5 | 60 min |
| verification/recovery token inspect | IP | 60 | 5 min |
| verification/recovery token complete | IP | 20 | 15 min |
| authenticated password change | IP + authenticated user | 10 | 15 min |

Web and Mobile login deliberately share one scope so alternating transports
cannot bypass the same password-guessing budget.

## Failure semantics

A rate-limit decision is made before the protected domain operation executes.

A denied request:

- does not call password verification/token issuance/email delivery;
- returns `RATE_LIMITED`;
- exposes no account-existence signal beyond the route's existing public
  contract.

The limiter uses the same Mongo authority required by Auth. Limiter persistence
errors are not silently treated as an allow decision.

## Verification

Permanent tests must prove:

1. atomic counter semantics and TTL index contract;
2. no raw IP/email/token is stored;
3. same IP + target reaches `RATE_LIMITED`;
4. same target from a different IP has an independent target allowance;
5. Web and Mobile login share the same login scope;
6. a denied request never reaches Auth/Email domain work;
7. stable `429 RATE_LIMITED` + `Retry-After`;
8. production rejects the known local HMAC secret;
9. container smoke exercises a real `RATE_LIMITED` outcome.

The carrier is not complete until exact-head and post-merge runs are green.
