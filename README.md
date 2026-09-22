# Los Apuntes

Reboot 2026 de Los Apuntes: una red universitaria mobile-first que conecta identidad académica, materias, conocimiento, personas, comunidad y oportunidades.

## Estado

El repositorio activo vive en `main`. Las ramas históricas `frontend` y `backend` son únicamente fuentes de proveniencia y no deben mergearse.

## Reglas de ingeniería

- GitHub remoto es la autoridad.
- Nada de `node_modules`, bases físicas, artefactos generados ni secretos versionados.
- El backend es la autoridad de seguridad y negocio.
- Web y mobile deberán compartir contratos; no se inventan APIs en clientes.
- La persistencia 2026 sigue abierta hasta reconciliar DER/diagramas reales.
- No se introducen microservicios ni infraestructura especulativa.
- Un PR no está listo por compilar: debe pasar el quality contract completo sobre su HEAD exacto.
- Dependencias de producción con vulnerabilidades high/critical bloquean el merge.

Ver `docs/architecture/engineering-guardrails.md`.

## Dominio 2026

Antes de fijar la base de datos, el producto usa un contrato conceptual independiente de Mongo/SQL:

- [Domain Contract 2026](docs/domain/domain-contract-2026.md)
- [DER reconciliation checklist](docs/domain/der-reconciliation-checklist.md)
- [MVP domain slices](docs/domain/mvp-domain-slices.md)

El modelo Mongo rescatado es implementación legacy. No define las cardinalidades ni entidades futuras.

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

Account, Profile y Academic Graph son conceptos distintos. El JWT/role del código legacy no es autoridad futura.

Identity/Auth v1 está code-complete en backend/Web. El cliente Mobile real sigue en #49 y la readiness pública/productiva sigue en #48.

## Runtime y workspace

- Node 24
- pnpm 9.15.9
- workspace único para aplicaciones y futuros paquetes compartidos
- un solo `pnpm-lock.yaml` en la raíz
- NestJS/Fastify para el API

## Verificación local

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm audit:prod
```

`pnpm check` ejecuta higiene, formato, lint, typecheck, tests y builds.

## Laboratorio local API + Mongo

El laboratorio reproduce el runtime actual sin persistir una base local en el repositorio. Mongo vive en `tmpfs` y representa únicamente la implementación rescatada actual; **no decide** la persistencia 2026.

Requiere Docker Desktop/Engine con Docker Compose v2.

```bash
pnpm runtime:up
pnpm runtime:smoke
```

El stack publica el API en `http://localhost:4000`. El smoke verifica liveness, readiness real contra Mongo, request IDs generados por el servidor y el envelope de errores HTTP.

Para ver logs:

```bash
pnpm runtime:logs
```

Para eliminar completamente el runtime efímero:

```bash
pnpm runtime:down
```

El laboratorio usa Mailpit como sink SMTP local para verificar emails de Auth sin enviar mensajes reales. Producción requiere un proveedor transaccional real y gestión externa de secretos.
