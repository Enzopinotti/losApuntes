# B74 — Recuperación durable del intento anterior al reclamar un lease vencido

**Producto:** Los Apuntes / exportación privada de cuenta  
**Baseline:** `main@83f03a759c1dc5d610f3baf955eb9e2f1b8ef344` (B72)  
**Estado de release:** #353 abierto; Study Progress bloqueado en producción

## Riesgo detectado

Antes de B74, `MongoAccountExportStore.claimNext` hacía un `findOneAndUpdate`
atómico que reemplazaba `claimId` en un job `processing` con lease
vencido. La consulta devolvía únicamente el **nuevo** job, y no registraba
el identificador del intento abandonado. El worker previo podía haber
completado o iniciado un multipart upload a
`exports/{jobId}/{oldClaimId}.json`, cuyo identificador ya no quedaba
referenciado por el job de Mongo. Si el proceso moría antes de su propia
compensación B69–B71, ese objeto no contaba con tarea de borrado durable.

Un `findOneAndUpdate` seguido de `enqueue` fuera de transacción no
cierra el problema: un crash después de cambiar de claim y antes de
persistir el cleanup volvería a perder la generación anterior.

## Contrato implementado

- `claimNext` utiliza ahora una **única transacción Mongo replica-set**
  con `findOneAndUpdate(..., {new:false,session,sort})` para obtener la
  preimagen de la fila y asignar el nuevo claim.
- Sólo si la preimagen tenía `state='processing'`, valida su
  `oldClaimId` como UUID, su `jobId` y propietario durables, y guarda
  una tarea idempotente `$setOnInsert` sobre
  `(jobId,oldClaimId)` en la colección privada
  `account_export_orphan_cleanup`, **dentro de la misma transacción**.
- El cursor de tareas nuevas `pending` conserva el flujo normal y no
  genera tareas S3 falsas.
- Si falla la cola o la validación de la preimagen, la transacción se
  aborta: no cambia `claimId`, no se entrega un trabajo incierto a un
  worker y no se borra S3.
- Una vez escritas ambas operaciones, `findOne` dentro de la misma
  sesión verifica explícitamente `id + userId + state='processing' +
  active + newClaimId`. Sólo se devuelve el trabajo si la transacción
  concluye y se pudo leer el nuevo claim exacto.
- La tarea de limpieza de una toma de lease vencido se programa **tres
  duraciones de lease después del takeover** como margen para una operación
  multipart del worker viejo todavía en curso. La cola conserva sus
  leases, heartbeat y reintentos B67–B72, verifica el dueño durable y no
  elimina un `artifactGeneration` todavía referenciado.
- Si `withTransaction` reintenta la función por conflicto transitorio,
  `claimed` se limpia antes de volver a probar: nunca se filtra el
  resultado de una transacción revertida.

### Límite importante

El margen temporal **no ofrece una garantía matemática** frente a
un multipart S3 que sobreviva indefinidamente y se complete después
del DELETE + ACK de limpieza. El backstop es la política lifecycle del
bucket aislado y la auditoría de objetos/versiones no actuales. Para
garantizar ausencia total habría que imponer plazos máximos verificables
a la subida o añadir reconciliación de inventario S3. No declaramos
exactly-once distribuido de Mongo+S3 ni cierre de ese gate.

## Matriz de pruebas incorporadas

**Jest Mongo store**: claim `pending` sin fila S3 anterior, reclaim
`processing` con cola exacta y delay, error de upsert que aborta
transacción, generación vieja malformada y fallo de postcondición.

**Mongo replica-set opt-in**: vencimiento y takeover real del claim viejo
con fila de limpieza; no inicia DELETE mientras espera el plazo;
transcurrido éste, sólo borra la generación antigua y conserva la nueva.
Otra prueba inyecta fallo de Mongo cola y comprueba que sigue existiendo
`oldClaimId` hasta el siguiente takeover correcto. Un caso `pending`
verifica que no se genera una compensación ficticia.

**Contratos estructurales**: `scripts/test-account-export-b74-takeover.mjs`
conectado a `pnpm test:account-lifecycle-contract`, junto con
B67–B72.

## Aceptación pendiente

La aceptación runtime exige checkout limpio de SHA exacto, Node 24,
pnpm 9.15.9, TypeScript/Jest, Mongo replica set **local y sin credenciales**,
pruebas con dos workers y un proveedor S3 con inyección de errores de
multipart. Usar
`pnpm accept:account-export:b70 --expected-sha <SHA>` para
TypeScript/Jest/Mongo y comprobar S3/HTTP/retención/backup separadamente.

Este bloque no habilita producción, no modifica endpoints ni los
manifiestos v1 (30), v2 (31), v3 (32) y no activa CI manual. Mantener
#353 abierto, `STUDY_PROGRESS_ENABLED=false` y conciliar PR #349,
#331 y #365 sobre el SHA integrado.
