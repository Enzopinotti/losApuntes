# Architecture Decision Records

Long-lived architectural decisions are recorded here before implementation locks them in.

Accepted:

- [ADR 0001 — Use Fastify as the NestJS HTTP adapter](0001-http-adapter-fastify.md)
- [ADR 0002 — Harden the API runtime boundary before domain expansion](0002-api-runtime-boundary.md)
- [ADR 0003 — Use opaque revocable sessions for Web and Mobile](0003-opaque-auth-sessions.md)
- [ADR 0004 — Use replaceable transactional persistence before/after DER reconciliation](0004-persistence-after-der.md)

Planned early ADRs:

- object storage/file authorization;
- search architecture when the MVP requires it.

An ADR records context, decision, consequences and rejected alternatives.
