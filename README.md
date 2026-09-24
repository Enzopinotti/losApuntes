# Los Apuntes

Reboot 2026 de Los Apuntes: una red universitaria mobile-first que conecta identidad académica, materias, conocimiento, personas, comunidad y oportunidades.

## Estado

El repositorio activo vive en `main`. Las ramas históricas `frontend` y `backend` son únicamente fuentes de proveniencia y no deben mergearse.

## Reglas de ingeniería

- GitHub remoto es la autoridad.
- Nada de `node_modules`, bases físicas, artefactos generados ni secretos versionados.
- El backend es la autoridad de seguridad y negocio.
- Web y Mobile comparten contratos; no se inventan APIs en clientes.
- Los módulos nuevos aíslan persistencia detrás de adapters/ports.
- El DER futuro de NotebookLM puede modificar el modelo físico sin convertirlo hoy en un bloqueo.
- No se introducen microservicios ni infraestructura especulativa.
- Un PR no está listo por compilar: debe pasar el quality contract completo sobre su HEAD exacto.
- Dependencias de producción con vulnerabilidades high/critical bloquean el merge.

Ver `docs/architecture/engineering-guardrails.md`.

## Dominio 2026

- [Domain Contract 2026](docs/domain/domain-contract-2026.md)
- [Academic Graph v1 implementation](docs/domain/academic-graph-implementation-v1.md)
- [Academic HTTP v1](docs/contracts/academic-http-v1.md)
- [Academic Graph completion matrix](docs/product/academic-graph-v1-completion-matrix.md)
- [Academic Catalog source strategy](docs/domain/academic-catalog-source-strategy-2026.md)
- [DER reconciliation checklist](docs/domain/der-reconciliation-checklist.md)
- [MVP domain slices](docs/domain/mvp-domain-slices.md)
- [Persistence preflight 2026](docs/architecture/persistence-preflight-2026.md)
- [ADR 0004 — replaceable persistence / DER reconciliation](docs/adr/0004-persistence-after-der.md)
- [Files + Notes v1](docs/domain/files-notes-v1.md)
- [Search + contextual discovery v1](docs/domain/search-discovery-v1.md)
- [Search + contextual discovery HTTP v1](docs/contracts/search-discovery-http-v1.md)
- [Search + contextual discovery completion matrix](docs/product/search-discovery-v1-completion-matrix.md)
- [Pilot Operations v1](docs/domain/pilot-ops-v1.md)
- [Pilot HTTP v1](docs/contracts/pilot-ops-http-v1.md)
- [Pilot completion matrix](docs/product/pilot-v1-completion-matrix.md)
- [Pilot operational runbook](docs/operations/pilot-v1-runbook.md)

El Mongo actual es un adapter de runtime, no la definición eterna del dominio.

## Identity/Auth v1

La primera frontera de producto usa un contrato compartido para Web y Mobile:

- [User journeys & account experience](docs/product/auth-user-journeys-v1.md)
- [Security & session contract](docs/security/identity-auth-v1.md)
- [HTTP contract](docs/contracts/auth-http-v1.md)
- [ADR 0003 — opaque revocable sessions](docs/adr/0003-opaque-auth-sessions.md)
- [Verification & recovery UX](docs/product/auth-verification-recovery-ux-v1.md)
- [One-time action-token security](docs/security/auth-action-tokens-v1.md)
- [Account Security Settings UX](docs/product/account-security-settings-v1.md)
- [Account security implementation contract](docs/security/account-security-v1.md)
- [Google identity security](docs/security/google-identity-v1.md)
- [Google login methods UX](docs/product/google-login-methods-v1.md)
- [Client Auth integration contract](docs/contracts/client-auth-integration-v1.md)
- [Identity/Auth v1 completion matrix](docs/product/identity-auth-v1-completion-matrix.md)

Account, Profile y Academic Graph son conceptos distintos.

## Academic Graph v1

El backend implementa:

- catálogo académico canónico con UUID estable;
- jerarquía flexible Country → Institution → niveles opcionales → Program → Curriculum → Subject → CourseOffering;
- alias, proveniencia, lifecycle y merge con redirects;
- permisos administrativos explícitos;
- afiliaciones múltiples/históricas;
- SubjectParticipation;
- CurrentAcademicContext server-authoritative;
- propuestas de datos faltantes sin canonicalización automática;
- auditoría académica durable;
- cobertura crítica y smoke real contra Mongo.

La implementación depende de `AcademicStore`, no de Mongoose fuera del adapter académico. El DER posterior puede reemplazar el modelo físico.

## Runtime y workspace

- Node 24
- pnpm 9.15.9
- workspace único
- un solo `pnpm-lock.yaml`
- NestJS/Fastify para el API
- MongoDB como adapter transaccional actual
- Mailpit para email local verificable
- RustFS privado/S3-compatible para Files local/CI
- worker dedicado para cleanup de uploads abandonados

## Verificación local

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm audit:prod
```

`pnpm check` ejecuta higiene, formato, lint, typecheck, tests y builds.

La CI agrega gates críticos específicos de Auth, Academic Graph, Profile, Files/Resources, Search, Social/Q&A, Feeds y Pilot, además del audit de dependencias y el smoke del stack real.

## Laboratorio local

```bash
pnpm runtime:up
pnpm runtime:smoke
```

El stack publica el API en `http://localhost:4000`.

El smoke cubre runtime base, Auth, Academic Graph, Profile, Files/Resources, Search/Contextual Discovery, Social/Q&A, Feeds y Pilot Operations contra Mongo replica-set y RustFS efímeros.

Para logs:

```bash
pnpm runtime:logs
```

Para eliminar el runtime efímero:

```bash
pnpm runtime:down
```

Producción requiere proveedor transaccional real de email, secretos externos y evidencia de edge/HTTPS separada del laboratorio local.
