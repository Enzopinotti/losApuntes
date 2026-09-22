# ADR 0001 — Use Fastify as the NestJS HTTP adapter

- Status: Accepted for the 2026 foundation
- Date: 2026-09-22

## Context

The historical API used NestJS with the default Express adapter.

During the 2026 rescue, the production dependency audit remained blocked by high-severity Multer advisories inherited through `@nestjs/platform-express@11.2.5`. The npm remediation path required upgrading to NestJS 12, which would mix a framework-major migration into the repository rescue.

The current API has no product feature that depends on Express-specific middleware or Express multipart handling. TOP already demonstrates that Fastify is a viable operational baseline for our engineering practices.

## Decision

Keep NestJS on major version 11 for the rescue and use `@nestjs/platform-fastify` as the HTTP adapter.

The application creates a `NestFastifyApplication` explicitly. Framework-specific request types are not allowed to leak into domain/auth contracts unless required by a concrete boundary.

## Consequences

- Express and `swagger-ui-express` are removed from production dependencies.
- Future multipart/file upload work must use a Fastify-compatible path and will be designed under the Files/Notes security contract rather than inheriting historical Multer behavior.
- Middleware copied from Express examples cannot be assumed compatible.
- Swagger remains generated through `@nestjs/swagger`.
- NestJS 12 remains a separate future upgrade, not an incidental security workaround inside this rescue.

## Rejected alternatives

### Upgrade all Nest packages to major 12 now

Rejected because it unnecessarily combines a major framework migration with repository rescue and would expand the verification surface before product work starts.

### Keep Express and suppress the audit finding

Rejected. The production dependency gate is intended to block known high-severity vulnerabilities, not document and ignore them.

### Disable the production dependency audit

Rejected because that would remove the guardrail precisely when it found actionable risk.
