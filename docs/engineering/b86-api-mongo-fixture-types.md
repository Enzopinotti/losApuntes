# B86 — Recuperación de TypeScript en fixtures Mongo de exportación

Fecha: 2026-10-16. Base de desarrollo final: `main@7ef5f4fcdb4f0213888f1671238d770c513da2b9`, que incorpora B86 loopback S3/Mongo acceptance y anteriores protecciones B84/B85 de Mongo primary clock.

## Diagnóstico comprobado

La CI exact-head del B85 ([run #38913821453](https://github.com/Enzopinotti/losApuntes/actions/runs/38913821453)) informaba cuatro errores de `pnpm --filter @losapuntes/api check:types`:

- `mongo-account-export.store.spec.ts`, alrededor de 338: TS2352/TS2493. `orphanCleanup.updateOne` estaba definido como `jest.fn(() => orphanWrite)`, por lo que Jest infería una tupla de argumentos **vacía**, aunque el test leía `mock.calls[0][1]` como documento de write-ahead de Mongo.
- Mismo archivo, alrededor de 764: TS2493 por `jobs.updateOne` definido sin argumentos e inspección posterior del primer `filter`.
- `study-progress-export.reader.spec.ts`, alrededor de 104: TS2353. La prueba negativa insertaba un plan persistido malformado con `unknownField`, pero el fixture estaba tipado como el plan exacto generado por `stored()`.

Los controles negativos no deben eliminarse ni relajarse para aprobar TypeScript.

## Cambios de B86

1. `jobs.updateOne` y `orphanCleanup.updateOne` conservan el mismo `query(...)`, pero sus mocks ahora reciben una tupla tipada `[filter: unknown, update: unknown, options?: unknown]`. La función absorbe explícitamente la tupla sin usar sus valores: los tests **sí** pueden inspeccionar las llamadas originales con `mock.calls` sin perder la longitud del array.
2. El test B80 de horizon del write-ahead deja de falsificar el tipo del `update` con `as {...}`. Comprueba que el payload contiene `$setOnInsert` y que los dos campos son `Date` reales, antes de comparar `nextAttemptAt` y `verificationUntil`. Un valor ausente o corrupto provoca fallo del test.
3. `StoredFixtureRow` hace que solo el campo persistido `plan` sea `unknown`. Se conserva exactamente la entrada malformada original y la expectativa de que `StudyProgressExportReader` la rechace. El contrato de producción del plan **no cambia**.
4. Prettier canónico de los dos archivos se aplicó en una rama temporal con `pnpm install --frozen-lockfile` y Node de `.nvmrc`; el workflow de escritura temporal no se incluye en este carrier.
5. Se añade `b86-api-typed-fixtures-quality.yml` (solo lectura), con tres jobs **independientes** sobre el SHA exacto del PR: formato/ESLint, TypeScript global y las dos suites Jest focalizadas.

## Reconciliación multiagente

- Este PR nació en B85 `main@303b53b...`, pero `main` avanzó ocho commits con B86 S3 loopback acceptance. Antes de portar, se confirmó igualdad de los blobs originales de **ambos** fixtures. El carrier final parte directamente de `main@7ef5f4f...`; no incorpora snapshots viejos ni cambia producción S3/Mongo.
- Los PR #383, #387, #391 y #396 contienen otras correcciones (CAS, epoch, formato, lint del processor) y no se asumen fusionados.
- Mantener los gates de aislamiento de propietarios, fences de lease y reloj Mongo, idempotencia, formato de exportación, limpieza S3 y paginación.
- No ejecutar Mongo real fuera del entorno de prueba local autorizado, no reutilizar storage privado, no activar flags ni hacer deploy.

## Aceptación y seguridad

Un **typecheck global PASS** solo valida tipos; no garantiza lint global, Jest global, release ni pruebas de réplica local. Reportar resultados exact-head de los tres jobs y `verify` global; si un job falla, conservar draft e investigar los hallazgos.

Issue #353 continúa HOLD, `STUDY_PROGRESS_ENABLED` apagado, `ACCOUNT_EXPORT_FORMAT_VERSION=1`. Dependencias #133 (excepción vencida en 2026-10-15) y #141 siguen exigiendo remediación real; nunca prolongar una excepción automáticamente.
