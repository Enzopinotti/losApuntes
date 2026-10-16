# B89 — Account Export: Jest matchers y mocks de limpieza Mongo estrictos

**Fecha:** 2026-10-16.

## Origen y aislamiento multiagente

- Parent exacto de este carrier: `fix/b88-mongo-acceptance-lint-b87-integrated-20261016@d1a118bbb2a3be37cf127d87b6c40a07932fd783`, [PR #404](https://github.com/Enzopinotti/losApuntes/pull/404), apilado sobre #403 y #399. No es una rama directamente fusionable sobre `main`.
- [B88 verify #38938050356](https://github.com/Enzopinotti/losApuntes/actions/runs/38938050356): 10/10 jobs críticos PASS, 127 suites API aprobadas (2 omitidas), 1314 tests PASS; Web/API/Mobile Prettier PASS. Strict lint API todavía tiene 253 errores / 0 warnings, y la auditoría falla por excepción node-forge vencida.
- PR [#405](https://github.com/Enzopinotti/losApuntes/pull/405), en rama alternativa sobre #402, toca `account-export.service.spec.ts`, readers, guards y plan. B89 **no modifica** ninguno de esos archivos. PR #391 contiene mocks antiguos sobre un parent distinto; no copiarlos en bloque.

## Correcciones (solo pruebas)

1. `account-export-processor.spec.ts`: las aserciones de Jest v2 (31 secciones), v3 (32 secciones), Date de retiros, reintentos y validación de fences siguen siendo las originales. `expect.objectContaining()` y `expect.any(Date)` devuelven `any` según sus tipos, por lo que se representan como predicados opacos `unknown` antes de entrar en objetos tipados. No se reemplaza el matcher ni se aflojan sus campos o tipos.
2. `mongo-account-export-orphan-cleanup.store.spec.ts`: los dobles `updateOne` y `deleteOne` declaran tuplas de parámetros Mongo `unknown` que Jest conserva en `mock.calls`. Se mantienen `mockReturnValueOnce(upsert)`, reintentos, ACKs, predicados exactos del reloj de Mongo, y todas las aserciones de filtros. Antes, Jest infería `any[][]` para los argumentos de un método sin parámetros y producía 4 errores de miembro inseguro. No hay dobles de funciones productivas nuevos.
3. CI read-only `b89-export-fixtures-quality.yml`: checkout de `github.event.pull_request.head.sha`, Node fijado, lockfile congelado, Prettier, ESLint `--max-warnings=0`, Jest completo de las dos suites y API TypeScript como job independiente. No se modifica el workflow global de calidad.

**Prettier de código** se ejecuta únicamente en una rama auxiliar y limitada a las dos pruebas; ninguna configuración con permisos de escritura queda instalada en el carrier.

## Condiciones de cierre

- PASS focalizado = estilo, lint, TypeScript y suites efectivamente ejecutadas **todos en SHA exacto de B89**; no basta con éxitos de B88.
- Mantener suites Mongo reales como explícitas opt-in para base local exclusiva y sin credenciales; test omitido **no** es evidencia de réplica real.
- El `verify` global y el security audit siguen siendo hard gates. No modificar scripts de seguridad, `pnpm-lock.yaml`, reglas ESLint, flags `STUDY_PROGRESS_ENABLED` ni `ACCOUNT_EXPORT_FORMAT_VERSION=1`.
- `main` incorporó B89 de seguridad de destino Mongo mientras trabajaban otros agentes. Antes de merge, reconciliar esta rama **stacked** con `main` nuevo, preservando validación DNS y loopback, clock fencing, SigV4 y S3 recovery.
- [Release readiness #353](https://github.com/Enzopinotti/losApuntes/issues/353): **HOLD**. Sin merges, deployments ni arranque de runtime hasta gates globales y aceptación autorizada.

Este documento describe el bloque de calidad, no implica aceptación de producción.
