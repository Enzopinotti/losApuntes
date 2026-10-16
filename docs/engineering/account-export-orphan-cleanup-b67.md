# B67 — Cola durable para limpiar generaciones S3 huérfanas

**Repositorio:** Enzopinotti/losApuntes. **Baseline:** main@aaf795cd87bfd3d74ddbaf56ec8abd0e9e3efcbb (PR #358, B66). **Estado:** implementación para revisión; aceptación de ejecución real pendiente y gate de producción #353 en HOLD.

## Motivación

B65–B66 resuelven la carrera de confirmación Mongo/S3 y diferencian el resultado desconocido del rechazo comprobado. Sin embargo, si S3 fallaba al eliminar una generación comprobadamente huérfana, el worker descartaba la acción y dependía solamente de la lifecycle rule del bucket. Un reinicio del proceso podía perder la oportunidad de eliminación inmediata.

B67 agrega una cola privada y durable en la colección Mongo `account_export_orphan_cleanup`; no agrega endpoints, exportaciones públicas, credenciales ni campos a los formatos portables v1/v2/v3.

## Diseño y seguridad

- Una fila única por `(jobId, generation)`: almacena `ownerUserId`, estado `pending/processing`, número de intentos, próximo intento, identificador de claim y vencimiento de lease. La inserción idempotente usa `$setOnInsert`; no reinicia intentos existentes ni pisa leases.
- Generaciones y trabajos deben ser UUID compatibles con las claves S3 `exports/{jobId}/{generation}.json`. Las claves no provienen de parámetros públicos.
- **Nunca se encola una finalización incierta.** Se encola únicamente si falla la eliminación de una generación cuyo claim perdió el lease, `complete() === false`, rechazo de epoch confirmado, o después de un `reschedule` CAS exitoso que prueba que el intento no publicó el trabajo.
- El worker consulta `AccountExportStore.findOwned(jobId,ownerUserId)` **antes de borrar**. Si el job figura `completed` con esa misma generación, se conserva S3 y se reconoce la tarea como resuelta. Si la autoridad owner/job no coincide, se reintenta sin borrar. Si el claim exacto todavía tiene un lease válido, se difiere.
- Si es seguro y S3 elimina el objeto, se reconoce la tarea con CAS sobre claim de la cola. Borrados y reintentos usan solo esa generación, nunca listan buckets ni borran prefijos.
- Si falla S3, Mongo o la lectura de autoridad, se agenda un reintento con backoff exponencial acotado a 6 horas; **no hay límite de intentos que descarte silenciosamente** la tarea. Una tarea `processing` sin heartbeat se recupera por lease vencido.
- Por iteración se reclaman como máximo 10 tareas de la cola. Un fallo de la cola no bloquea el procesamiento de exportaciones normales, pero aumenta `orphanRetries`.
- Observabilidad del worker: contadores `orphanDeleted`, `orphanPreserved`, `orphanRetries`, sin registrar propietario, ID, URL, planes, credenciales o generación.

## Actualización B69 — intención persistida antes del borrado

B69 endurece el orden de operaciones descrito en B67: en lugar de intentar eliminar S3 primero y encolar solamente si falla, el procesador **persiste la tarea de compensación antes de invocar S3**. Si el borrado inmediato termina bien, ejecuta `clearPending` condicionado a que la tarea siga sin reclamar; si falla o el proceso se cae, la tarea ya existe y puede recuperarse. La autoridad para generar esta intención sigue siendo exactamente la misma de B65–B68 y nunca un resultado de completion Mongo incierto. La documentación original de B67 representa el comportamiento inicial, ahora reemplazado por B69.

## Límites

- El encolado es mejor-esfuerzo después de una falla S3: si Mongo tampoco responde, el bucket privado sigue siendo el último mecanismo de eliminación. Esta combinación **no garantiza eliminación física inmediata**, legal, de réplicas o de versiones no actuales.
- El chequeo de estado previo al borrado es defensivo. La autorización real para considerar huérfana la generación procede de los CAS/errores definitivos del flujo B65–B66. Un registro de la cola no significa por sí solo que una exportación privada completada deba borrarse.
- No se ejecuta transacción Mongo durante llamadas a S3; el borrado S3 y ACK Mongo son idempotentes y toleran caída intermedia. Si el ACK falla, la tarea se recuperará por lease y podrá reintentar borrar el mismo objeto.
- Para un bucket versionado, la lifecycle rule puede dejar versiones antiguas retenidas; hay que revisar política de NoncurrentVersionExpiration, backups y obligación de retención antes de habilitar producción.
- Esta cola sólo gestiona generaciones **conocidas y encoladas**. No enumera el bucket para localizar huérfanos históricos anteriores a B67, ni es un snapshot global de las 32 secciones.

## Evidencia aportada

- Jest del store Mongo: llave única, `$setOnInsert`, duplicados concurrentes, validación de IDs, CAS claim, ACK y retry.
- Jest del worker: rechazo de autoridad cruzada, conservación de S3 cuando hay job completado, espera por claim válido, reintentos S3 y fallos de ACK, y encolado sólo tras una falla confirmada.
- Mongo opt-in con replica set local verificado en `study-progress.mongo-int.spec.ts`: durabilidad ante reinicio con claim recuperable y deduplicación; reintento persistido con `nextAttemptAt` y `attempts`.
- `scripts/test-account-export-b67-orphan-queue.mjs` anexado al contrato habitual `pnpm test:account-lifecycle-contract`.

## Criterios pendientes antes de release

- Ejecutar en **Node 24**, pnpm 9.15.9 con checkout completo: `pnpm install --frozen-lockfile`, typecheck, format/lint, Jest y scripts contractuales sobre el SHA exacto.
- Ejecutar tests Mongo opt-in sólo en replica set **local, efímero y sin credenciales**. Ensayar restart, dos workers simultáneos, fallo S3 transitorio, ACK perdido y reconciliación B66.
- Smoke HTTP y objeto S3 real con política de bucket privado. Verificar retención, versionado, backups/restore y alertas para `orphanRetries`.
- Mantener #353 abierta y `STUDY_PROGRESS_ENABLED` desactivado; ningún waiver de supply chain agregado.

## Integración paralela

PR #349 modifica formato API en data-lifecycle; conservar el provider Nest, las llamadas `deleteOrEnqueueProvenOrphan` y los contadores. PR #331 afecta pruebas de exportación legacy; conservar v1=30, v2=31 y v3=32 sin epoch para v1/v2.
