# B75 — Verificación durable contra finalizaciones multipart S3 tardías

**Repositorio:** `Enzopinotti/losApuntes`.  
**Base:** `main@a763ddc4bf85374d27208ce05db5e7c26bf3c118` (B74).  
**Gate:** #353 permanece OPEN; `STUDY_PROGRESS_ENABLED` debe permanecer deshabilitado en producción.

## Riesgo restante identificado después de B74

Al recuperar un job `processing` con lease expirado, B74 ya escribía una tarea de compensación duradera para su antigua generación S3 y demoraba el primer DELETE durante tres leases. Sin embargo, después de **un único DELETE exitoso**, el compensador hacía ACK y eliminaba la fila durable.

Un `CompleteMultipartUpload` iniciado por el worker antiguo podía resolver más tarde y volver a crear la clave del objeto **después del DELETE+ACK**. En ese caso se perdía la tarea, quedando únicamente la lifecycle rule del bucket. El problema no se soluciona con una demora inicial fija.

## Comportamiento funcional de B75

1. **Horizon persistido:** el takeover de un intento `processing` vencido añade `verificationUntil`, una fecha hasta **una hora** después del takeover. Sólo afecta a los intentos anteriores; jobs nuevos `pending` y huérfanos comunes no entran a este protocolo.
2. **Primera espera intacta:** el primer intento de limpieza conserva el plazo inicial de **tres duraciones de lease** (B74).
3. **Reverificación at-least-once:** después de cada DELETE exitoso, si todavía no se alcanzó `verificationUntil`, el worker no ACKea. Reprograma por CAS la misma fila durable a diez minutos o al final de la ventana, lo que ocurra antes.
4. **Seguridad en cada pasada:** vuelve a consultar el job real por ID, valida dueño, referencias a generación actual y lease. Nunca usa la cola como autorización suficiente para borrar. Cuando la última pasada vence, repite DELETE de la clave exacta y hace ACK condicionado al claim y horizonte.
5. **Concurrencia:** el takeover extiende `verificationUntil` con `$max` para filas preexistentes (no sólo con `$setOnInsert`), y extiende `nextAttemptAt` de tareas aún `pending` hasta el período de asentamiento. Ambos pasos comparten la transacción del claim. No roba tareas `processing` de otro worker.
6. **ACK y cancelación protegidos:** el método de ACK ahora compara la fecha `verificationUntil` observada al reclamar; si un takeover la extendió desde entonces, la tarea no puede eliminarse mediante un ACK obsoleto. La cancelación `clearPending` usada por el worker original sólo puede eliminar tareas legacy sin ventana (`verificationUntil: null`).
7. **Fail closed:** si `verificationUntil` está corrupto, se rechaza antes de hacer DELETE y se reintenta. Una pérdida de lease o un `retry` cuyo CAS devuelve false nunca se contabilizan como tarea completada.

### Observabilidad

`orphanVerificationScheduled` cuenta reprogramaciones confirmadas para verificar nuevamente un objeto. `orphanDeleted` sigue indicando ACK final exitoso tras DELETE de la última pasada, mientras `orphanRetries` registra problemas de lease, proveedor o persistencia. No contiene identificadores de usuarios, buckets ni objetos.

## Pruebas incluidas

- Worker Jest: DELETE temprano sin ACK, borrado final tras vencer la ventana, metadatos de verificación corruptos, error CAS al reprogramar, archivo nuevamente referenciado por un job durable.
- Mongo store Jest: `verificationUntil` se inserta en el takeover y se extiende monotónicamente si ya existía una tarea. `clearPending` distingue tareas con horizonte y `acknowledge` compara la fecha reclamada.
- Mongo replica-set opt-in: B74 actualiza su escenario para requerir múltiples pasadas y un segundo worker después de reinicio; otro escenario comprueba que el ACK de una tarea reclamada antes del takeover ya no puede eliminarla; otro demuestra que la cancelación del primer worker no elimina una tarea con ventana.
- Contrato `scripts/test-account-export-b75-reverification.mjs` incorporado a `pnpm test:account-lifecycle-contract`.

## Límites y aceptación

**Una hora es una ventana de mitigación, no una prueba de ausencia permanente.** Si un proveedor acepta o materializa `CompleteMultipartUpload` después del límite, el objeto todavía podría reaparecer. También pueden quedar versiones anteriores, réplicas o backups. Para cerrar el gate se necesita una combinación verificada de timeout/proveedor, lifecycle privada, inventario periódico de objetos, expiración de multipart incompletos, versionado y simulación E2E de respuestas perdidas. No afirmamos exactamente-una-vez ni borrado inmediato universal.

No se alteran endpoints, auth, pagos, manifiestos v1/v2/v3 (30/31/32 secciones) ni flags productivos. Las suites TS/Jest/Mongo/S3 sólo pueden declararse aprobadas una vez ejecutadas realmente sobre un checkout exacto con Node 24, pnpm 9.15.9 y replica set local. Ejecutar `pnpm accept:account-export:b70 --expected-sha <MERGED_SHA>` y las pruebas de proveedor S3/HTTP aparte. Mantener #353 abierta.
