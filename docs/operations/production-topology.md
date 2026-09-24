# Production topology contract

**Status:** deployment contract — concrete provider values required before launch

This document defines how Los Apuntes may be placed behind an ingress/reverse proxy without turning arbitrary forwarded headers into client identity.

## Authority

The application is authoritative for authentication, authorization and product behavior. The deployment is authoritative for:

- public DNS and TLS termination;
- ingress/reverse-proxy hops;
- network ACLs between ingress and API;
- the exact proxy IP/CIDR allowlist;
- edge/WAF controls when used.

## Deployment profile

`DEPLOYMENT_PROFILE` separates framework mode from deployment security posture:

- `local` is only for the isolated developer/CI stack;
- `production` is the real deployment posture and is the default whenever `NODE_ENV=production` and no profile is supplied.

The production profile requires HTTPS public Web, action-link and Files origins. The local profile may coexist with `NODE_ENV=production` only while those public origins remain loopback.

## Default

`TRUSTED_PROXY_CIDRS` is empty by default.

With an empty value the Fastify adapter uses `trustProxy: false`. `X-Forwarded-For`, `Forwarded` and similar headers are not treated as authoritative client-address input.

This is the safe direct-connect/default configuration.

## Behind an ingress

When the API is reachable only through reviewed proxy hops, configure:

`TRUSTED_PROXY_CIDRS=<proxy-ip-or-cidr>,...`

Rules:

- only literal IPv4/IPv6 addresses or CIDR ranges are accepted;
- wildcards, hostnames and named shortcuts are rejected;
- list only hops that can actually connect to the API;
- do not use `0.0.0.0/0` or `::/0` merely to make forwarded addresses work;
- network policy should prevent untrusted clients from bypassing the ingress and reaching the API directly.

The runtime uses this allowlist before any future client-IP rate limiting is considered authoritative.

## Required production record

Every deployment/release evidence package must record:

- public Web origin;
- public API origin;
- TLS termination point;
- ingress/provider;
- number/order of proxy hops;
- exact `TRUSTED_PROXY_CIDRS` value;
- whether direct API access is network-blocked;
- edge/WAF rate-limit policy, when enabled;
- API-level rate-limit policy, when enabled;
- evidence that an untrusted forwarded address is ignored;
- evidence that the reviewed ingress produces the expected client address.

No value above is hard-coded into the repository because it depends on the real deployment.

## Related controls

- browser CORS uses one exact `WEB_ORIGIN`;
- cookie-auth unsafe requests use exact Origin + Fetch Metadata CSRF checks;
- production session cookies are Secure/HttpOnly/host-only;
- Swagger is disabled by default in production;
- health/readiness endpoints remain deployment probes, not public trust signals.

## Rollback

If the proxy topology changes unexpectedly:

1. set `TRUSTED_PROXY_CIDRS` back to empty/known-safe values;
2. restart the API;
3. verify forwarded addresses are no longer trusted;
4. do not enable IP-based abuse controls until the reviewed topology is restored.
