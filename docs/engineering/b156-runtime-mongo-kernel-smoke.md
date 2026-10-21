# B156 — Recuperar CI runtime ante incompatibilidad MongoDB 8 / kernel Linux

**Base original:** `main@6bd965c71f6426da3d49fc7c0555e0e5afda06a9`. **Fecha:** 20/10/2026.
**Alcance:** infraestructura de verificación del repositorio, no despliegue productivo.

## Incidente verificable

En [verify #39420758711](https://github.com/Enzopinotti/losApuntes/actions/runs/39420758711), disparado por B152, los 10 jobs de cobertura crítica y `Quality Gate` aprobaron, pero `Container runtime smoke` falló **antes del arranque de la API**:

- `Build and start runtime`: `dependency failed to start: container losapuntes-mongo-1 exited (1)`.
- El contenedor registró un error fatal `id:12257600`: MongoDB no puede iniciar en ciertos kernels Linux 6.19+ por incompatibilidad con TCMalloc, [SERVER-121912](https://jira.mongodb.org/browse/SERVER-121912).
- [MongoDB 8.0 release notes](https://www.mongodb.com/docs/manual/release-notes/8.0/) describen el rango incompatible **6.19 a 7.0.13** y el soporte restaurado desde **7.0.14**.
- `Production dependency audit` sigue fallando de forma independiente por #133 y #141. No hubo evidencia de regresión de la API por ese fallo de inicialización del contenedor.

## Solución estrictamente CI

1. Cambiar **solo** el runner del job `runtime-smoke` de `ubuntu-24.04` a `ubuntu-22.04`; los demás jobs siguen en el runner canónico. Es una selección de **host de prueba**, no un cambio en MongoDB o en el servidor de producción. No asumir que Ubuntu 22.04 garantiza un kernel seguro.
2. Verificar `uname -r` con `scripts/ci/check-mongo-kernel.mjs` **antes** de instalar/buildar runtime. El clasificador falla si el kernel cae en el intervalo conocido incompatible o no se puede interpretar.
3. Pruebas `node:test` comprueban ambos límites y kernels inválidos. El preflight no dice que Mongo arrancó: `validatedByMongoStartup:false` siempre. Solo Compose real y smoke HTTP completados prueban su arranque y comportamiento funcional.
4. Mantener `mongo:8.0`, `rs0`, healthcheck, URL, lógica `MongoDB`, workers, almacenamiento local y todos los scripts de smoke existentes sin modificaciones. No se aplican hacks de `rseq`, flags de Mongo, overrides de librerías ni downgrade a MongoDB 7.
5. Al detectar otra transición de kernels en los hosts de CI, el preflight producirá un error preciso; no debe maquillarse como PASS ni omitirse un job.

## Gate y límites

**Se exige aceptación en el HEAD exacto de B156**: test Node24 y preflight con kernel real, `docker compose up --build -d --wait`, navegador Auth + 11 smokes HTTP, logs, cleanup y global `Quality Gate`. Solo esas ejecuciones autorizan afirmar que el smoke se recuperó; no certifican release.

Las vulnerabilidades `node-forge` / `braces` siguen #133 / #141 y `pnpm audit --prod --audit-level high` debe seguir bloqueando `verify`; el release #353 permanece HOLD. El bloque no cambia excepciones de auditoría, feature flags ni realiza merge/deploy con CI roja.
