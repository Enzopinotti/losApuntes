# B69 — Write-ahead orphan cleanup and executable acceptance repairs

**Repository:** `Enzopinotti/losApuntes`  
**Baseline:** `main@6b64fa72c03d54fa4e19b351c02b94099455544a` (B68)  
**Status:** Código y pruebas incorporadas; aceptación runtime pendiente; issue #353 sigue abierta y Study Progress permanece deshabilitado en producción.

## Problemas confirmados en la revisión

1. El mecanismo B67–B68 ejecutaba `deleteArtifact(jobId,generation)` **antes** de encolar un reintento. Una caída del proceso después de una falla S3 y antes de persistir la tarea perdía la recuperación, dejando sólo la lifecycle rule del bucket.
2. La suite `account-export-processor.spec.ts` tenía un cierre de bloque `}` aislado justo antes de los tests B67/B68. Se restauró la pertenencia de esos tests al `describe('AccountExportProcessor',...)`, que incluye `afterEach(() => jest.useRealTimers())`. La estructura anterior era inválida y ocultaba la limpieza de timers.
3. Una expectativa de B67 llamaba al método interno `findForOrphanCleanup` con **dos argumentos**, mientras su interfaz B68 recibe **sólo el ID**. El test se corrigió sin cambiar el control real de propietario.

## Implementación funcional

`AccountExportProcessor.deleteOrEnqueueProvenOrphan(job,generation)` ahora sigue este orden, para **huérfanos demostrados** (lease perdido, `complete()===false`, epoch conflict confirmado, o `reschedule` CAS exitoso):

1. **Write-ahead:** `AccountExportOrphanCleanupStore.enqueue(...)` idempotente por `(jobId,generation)` persiste el intento en la colección Mongo privada *antes* de S3.
2. **Fast path:** ejecuta `deleteArtifact(jobId,generation)` sobre **la generación exacta**.
3. **S3 falla:** la tarea ya persistida permanece `pending` para que otro worker/reinicio la recupere con el lease y el backoff existente.
4. **S3 elimina correctamente:** ejecuta `clearPending({jobId,generation})`, un CAS `deleteOne` que **sólo** borra una fila `state='pending', claimId=null`. Si otro worker ya la reclamó, el CAS devuelve `false` y deja al reclamante terminar el flujo idempotente. Si la cancelación falla, el reintento futuro es seguro: reconoce la ausencia del objeto, elimina/ACK según política de S3 compatible.
5. **Mongo enqueue falla:** aún intenta el borrado S3 de forma segura; si también falla, queda como último respaldo la lifecycle rule del bucket aislado. El fallo no modifica el resultado durable de la exportación ni relaja el fence de propietario.
6. **Mongo completion incierto:** **no** se crea intención. Se mantiene la reconciliación B66 por generación/owner/SHA256; sólo se ingresa a write-ahead luego de demostrar la ausencia de commit mediante el CAS que cambia el job a pending/failed.

La cola sigue sin ser una autorización general para borrar: B68 verifica propietario real, referencias a trabajos completados, claim vivo, lease de tarea y heartbeat de S3. La operación es *at-least-once* e idempotente, no exactly-once distribuido.

## Pruebas añadidas y reparadas

- **Unit Jest del worker:** encolado antes de S3 incluso si S3 falla; continuidad tras fallar `clearPending`; intento de cancelación bloqueado por otro worker; tolerancia a indisponibilidad simultánea de Mongo/S3 sin fingir éxito; no encolado para resultado ambiguo Mongo.
- **Unit del store Mongo:** `clearPending` sólo para filas `pending` no reclamadas, no para `processing`; conserva `renewLease`, `acknowledge`, `retry` con CAS.
- **Opt-in Mongo replica set local y aislado:** primer worker confirma `reschedule`, persiste intención *antes* del intento DELETE y sufre falla S3; segundo worker, con nuevas instancias, recupera la fila durable y borra/ACK. Otro caso comprueba que `clearPending` no puede suprimir el claim adquirido por otro proceso.
- **Corrección de suite:** se restableció el cierre único del `describe` para B67/B68 y la expectativa de un único argumento de `findForOrphanCleanup`.
- **Contrato estático:** `scripts/test-account-export-b69-writeahead.mjs`, anexado a `pnpm test:account-lifecycle-contract`, inspecciona orden de escritura y borrado, CAS de cancelación, conservación de B66, restauración de la suite y pruebas Mongo.

## Criterios de aceptación pendientes

Este carril inspeccionó el código en GitHub. **No se ejecutaron todavía** `pnpm --filter @losapuntes/api check:types`, Jest ni Mongo/S3/HTTP reales. En el checkout exacto con Node 24 y pnpm 9.15.9:

```bash
pnpm install --frozen-lockfile
pnpm --filter @losapuntes/api check:types
pnpm --filter @losapuntes/api exec jest --runInBand \
  data-lifecycle/domain/account-export-processor.spec.ts \
  data-lifecycle/mongo/mongo-account-export-orphan-cleanup.store.spec.ts
pnpm test:account-lifecycle-contract
```

Para Mongo **exclusivamente** replica set local sin credenciales, continuar con `STUDY_PROGRESS_TEST_MONGO_URI` y la suite `study-progress.mongo-int.spec.ts`; los guards del archivo rechazan topología remota. Ejecutar fault injection con dos workers, S3 accesible/no accesible, ACK perdido, reinicio y verificación de artefacto descargable.

### Límites y release

No se garantiza eliminación instantánea de versiones no actuales en buckets versionados, réplicas, backups o archivos históricos no registrados. Persistencia de intención y borrado S3 pertenecen a dos sistemas diferentes: un apagado **antes** de encolar sigue sin tener compensación atómica; el bucket lifecycle continúa como protección. No se habilita `STUDY_PROGRESS_ENABLED` en producción, no se modifica auth/pagos y no se cierran los gates #353, #133 o #141.

**Conciliación:** el PR paralelo #349 toca estilo de `data-lifecycle` y debe conservar el nuevo orden write-ahead → S3 → `clearPending`; #331 toca tests legacy v1 y debe conservar la suite reparada, el `afterEach` para timers y los manifests 30/31/32.
