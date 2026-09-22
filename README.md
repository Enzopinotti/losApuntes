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

No se necesita una contraseña real para este lab. `LOSAPUNTES_DEV_JWT_SECRET`, cuando se define, debe ser únicamente un valor local descartable; producción usa gestión externa de secretos.
