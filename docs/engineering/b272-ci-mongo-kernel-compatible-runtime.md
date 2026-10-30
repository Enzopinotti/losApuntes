# B272 — Recuperación del runtime smoke MongoDB 8 ante kernel GitHub incompatible

## Evidencia del fallo del 30-Oct-2026

El job `Container runtime smoke` de [verify #41047431854](https://github.com/Enzopinotti/losApuntes/actions/runs/41047431854), HEAD de #738, tiene **Quality Gate PASS** y **10/10 coberturas críticas PASS**, pero `Build and start runtime` falla durante el arranque de Mongo, antes de ejecutar cualquier endpoint de producto. Log real de Mongo (id 12257600):

> MongoDB cannot start: Linux kernel versions 6.19 and newer has a known incompatibility with this version of MongoDB. See SERVER-121912.

`docker compose` informa `dependency failed to start: container losapuntes-mongo-1 exited (1)`. Los contenedores Mailpit y RustFS se iniciaron; no hay evidencia de fallo en la funcionalidad de avatares. La advisory de MongoDB describe el problema TCMalloc/rseq y la incompatibilidad de kernels de esa generación. El runner del workflow canónico era `ubuntu-24.04`.

## Solución conservadora de CI (reconciliación del carrier #484)

1. Mover **únicamente el job `runtime-smoke`** a `ubuntu-22.04`. No cambiar los otros 11 jobs ni cambiar versiones de MongoDB 8, sus datos o la API.
2. Verificar `uname -r` mediante `scripts/ci/check-mongo-kernel.mjs` antes de descargar imágenes; abortar explícitamente si el kernel cae en el intervalo 6.19–7.0.13 o es inválido.
3. Probar la política con `node --test scripts/ci/check-mongo-kernel.test.mjs`. El preflight nunca declara que Mongo levantó; sigue siendo indispensable Compose real y el smoke Auth + once ciclos HTTP.
4. Workflow focal `b156-mongo-kernel-bootstrap.yml`: arrancar un Mongo 8 en un runner compatible, verificar `isWritablePrimary` y limpiar los volúmenes.
5. Mantener `compose.local.yml`, `compose.health.yml`, mongo:8.0, Mailpit, RustFS, autenticación, API, tests de Web/Mobile y los scripts de smoke sin modificar. No usar `GLIBC_TUNABLES` ni bajar a MongoDB 7 para ocultar el problema.

## Límites y aceptación

- `ubuntu-22.04` no **garantiza** un kernel compatible: la comprobación fail-closed y el arranque real deben pasar en el HEAD exacto.
- Cualquier regresión o kernel no reconocido debe producir FAIL con logs accesibles.
- No modificar auditoría de supply chain. La producción mantiene HIGH #133 node-forge y #705 Zod: el cambio sólo puede restablecer el smoke, **no desbloquea el release ni habilita automáticamente merges**.
- Evidencia requerida: scripts B156 PASS + Mongo primary PASS + Container runtime smoke PASS + Quality Gate + 10 dominios + Production dependency audit PASS, todos sobre el SHA correcto.
- La fuente histórica #484 permanece rastreable; esta PR porta su intención sobre el `main` real de octubre 30, sin fusionar un árbol viejo.
