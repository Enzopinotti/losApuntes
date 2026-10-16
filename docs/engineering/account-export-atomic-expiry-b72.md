# B72 — Retiro atómico de exportaciones vencidas y limpieza durable

**Proyecto:** Los Apuntes 2026 · exportación privada de cuenta.  
**Baseline:** `main@8e254d1d1807ff2aa01ce4fea232ed1340dbac53` (B71).  
**Estado:** implementación B72 y tests listos para aceptación; issue #353 en HOLD, `STUDY_PROGRESS_ENABLED` deshabilitado en producción.

## Riesgo que resuelve

Hasta B71, `AccountExportProcessor.deleteExpiredArtifacts` ejecutaba `S3.deleteArtifact(id,generation)` **antes** de `AccountExportStore.clearExpiredArtifact`. Eso abre dos ventanas de inconsistencia:

1. Si otra transacción extendía el vencimiento o cambiaba la generación antes del CAS de Mongo, el DELETE anterior podía destruir bytes que la fila durable todavía referenciaba; un `clearExpiredArtifact=false` no podía repararlo.
2. Si el proceso caía después de limpiar la referencia pero antes de registrar la limpieza de S3 (o la respuesta de Mongo era ambigua), el objeto podía quedar huérfano sin tarea durable, confiando sólo en la política de expiración del bucket.

Además, una falla en `findExpiredArtifacts` abortaba toda `runIteration` e impedía procesar nuevas exportaciones aunque las dos tareas fueran independientes.

## Implementación funcional

- Nuevo contrato `AccountExportStore.retireExpiredArtifact({id,generation,expiresAt,now})` reemplaza el inseguro `clearExpiredArtifact`.
- `MongoAccountExportStore.retireExpiredArtifact` abre **una única transacción Mongo**. Hace CAS de `id + state='completed' + generation exacta + artifactExpiresAt == expiresAt <= now`, desvinculando `artifactGeneration` solo si todavía es debido.
- Obtiene `ownerUserId` **del documento durable anterior** a la modificación; no lo acepta de una tarea arbitraria de cola.
- Dentro de **la misma sesión/transacción** hace `upsert` idempotente `$setOnInsert` sobre la colección `account_export_orphan_cleanup`, con índice único `(jobId,generation)`, propietario durable, estado `pending` y `nextAttemptAt`.
- Si el CAS ya no coincide, no hay desvinculación ni cola. Si falla el upsert, la transacción completa hace rollback y el objeto conserva su referencia. Si el commit ya ocurrió pero la respuesta se perdió, ambas escrituras quedan juntas; la cola puede recuperarse en iteraciones posteriores.
- Se elimina por completo el DELETE directo del barrido de expiraciones. El posterior `drainOrphanCleanup` reutiliza todas las protecciones B67–B71: validación de propietario real, rechazo de generaciones aún referenciadas, lease renovable y reintentos S3 a prueba de reinicios.
- La fase de expiración queda aislada: una falla de lectura incrementa `expirationRetries` y deja procesar nuevas exportaciones. Cada artefacto se procesa de forma independiente y un fallo no impide los restantes.
- Nuevas métricas: `expiredRetired` (referencia desvinculada + compensación registrada) y `expirationStale` (CAS antiguo/rechazado). `orphanDeleted` refleja eliminaciones efectivas de S3. `expiredDeleted` queda en el shape legacy por compatibilidad, pero no se incrementa en B72 para evitar confundir desvinculación con borrado real.

## Pruebas incorporadas

**Unit worker:** retiro sin DELETE directo, CAS rechazado que no borra y no bloquea exportaciones, fallo del barrido de expiraciones que no detiene claims nuevos, excepción transaccional/ACK incierto que conserva el archivo.

**Unit Mongo store:** CAS exacto con devolución de documento anterior, `upsert` por generación en la misma sesión, faltante de registro que no encola, rollback de la transacción ante fallo de la cola, fallo cerrado si el modelo de cleanup no está conectado.

**Mongo replica-set local opt-in:** expiración end-to-end con unlink + cola + S3 DELETE por worker; crash entre transacción y DELETE con recuperación por nuevo worker tras outage transitoria; rechazo de CAS por cambio de vencimiento; rollback real de la referencia si la inserción de cola falla.

**Contrato:** `scripts/test-account-export-b72-atomic-retirement.mjs` conectado a `pnpm test:account-lifecycle-contract`, verificando fuente y pruebas.

## Aceptación y limitaciones

- La transacción exige MongoDB replica set, igual que los fences anteriores B65/B66. El registro se implementa dentro del mismo `DataLifecycleModule`, con inyección `@InjectModel(AccountExportOrphanCleanup.name)`.
- No hay listado de S3 ni DELETE por prefijo; sólo clave de job/generación con UUID. Los objetos del bucket pueden estar versionados o replicados; los controles de `NoncurrentVersionExpiration`, backups y retención necesitan auditoría externa.
- No se cambió ningún endpoint, autenticación, pagos ni los manifiestos export v1 (30), v2 (31), v3 (32).
- **No declarar Jest/TS/Mongo/S3/HTTP PASS sin ejecución real.** En este carril GitHub se prepararon las suites y se validan scripts estructurales. El release de producción sigue bloqueado por #353.
- Para ejecución real: checkout limpio al SHA final, Node 24, pnpm 9.15.9, `pnpm accept:account-export:b70 --expected-sha <SHA>` con `STUDY_PROGRESS_TEST_MONGO_URI` apuntando a replica set **efímero, local y sin credenciales**. Validar después S3, HTTP, backups y retención en un ambiente aislado.
- PRs #349 y #331 deben preservar `retireExpiredArtifact` y los tests B72; no reintroducir `deleteArtifact` antes del CAS de expiración.
