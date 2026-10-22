# B113 — Confirmación exacta de escrituras S3; HTTP 202 no es persistencia

**Base:** `main@bcdd8aca05ec8a2f7151e98417db528eb7bfac7b` (B112).  
**Release:** issue #353 OPEN/HOLD, `STUDY_PROGRESS_ENABLED=false` en producción. Sin CI manual ni despliegue.

## Defecto productivo

El adaptador S3 validaba las respuestas de `PutObject`,
`CreateMultipartUpload`, `UploadPart` y `CompleteMultipartUpload`
con `response.ok`. En Fetch, `ok === true` para **cualquier
estado 200–299**, incluidos:

- `202 Accepted`: el servidor aceptó procesar la petición,
  pero no acredita que el objeto se haya persistido.
- `204 No Content`: es válido para cancelar un upload
  multipart, **no** para confirmar bytes escritos.
- `206 Partial Content`: una respuesta parcial que no demuestra
  que una parte multipart esté confirmada, aunque traiga un
  encabezado `ETag` plausible.

El camino más peligroso era el `PUT` de un objeto pequeño:
`HTTP 202` podía establecer `completed=true` y el llamador
seguía como si el archivo estuviera guardado. En multipart,
una respuesta de parte `206` con ETag podía entrar en el XML
de finalización. Asimismo, `abort()` aceptaba `HTTP 202`
y podía liberar el `uploadId` sin cancelación confirmada.

## Corrección funcional

Nuevo helper puro `s3-write-ack-status.ts`, integrado con el writer:

- **Solo HTTP 200** confirma las cuatro operaciones S3 de
  escritura: `PUT` de objeto, POST de inicio multipart, PUT de
  parte y POST de finalización. En el último paso sigue
  siendo **obligatorio**, además del 200, el XML de confirmación
  B96/B99/B102/B103 y el readback B90 antes de publicación.
- Cualquier otro estado 2xx se trata como **ACK no confirmado**,
  igual de inseguro que una respuesta de fallo. Se cancela
  el cuerpo HTTP recibido cuando corresponde, se propaga el
  error original del estado y la bandera terminal `failed`
  de B104 prohíbe reintentar `complete()` en ese writer.
- El aborto multipart usa una regla distinta:
  `HTTP 204` (respuesta estándar), `HTTP 200` compatible
  o `HTTP 404` idempotente. `HTTP 202` **no basta**:
  se retiene el `uploadId` y es posible volver a intentar
  el aborto, siempre respetando la cola FIFO B105.
- En exportaciones privadas,
  `deleteObjectOnAbort:false` continúa impidiendo un
  `DELETE Object` sin comprobación de propietario B80/B81.
  Ante una confirmación 202 ambigua, el proveedor **puede
  haber guardado bytes**: solo el mecanismo owner-fenced
  y B90 tienen autoridad sobre publicación/limpieza.
- Una iniciación `202` que el proveedor ya haya creado
  podría dejar un multipart remoto cuyo ID no se reconoce
  como confirmado. Es indispensable mantener una política
  externa de limpieza de multiparts incompletos de S3.

No se modifica la forma de la firma SigV4, ni los permisos,
rutas de objeto o parámetros multipart.

## Pruebas

- **8 grupos `node:test` nativos**: status 200 específico,
  202/204/206 no confirmados, abort idempotente 200/204/404,
  estados inválidos y valores inesperados.
- **5 pruebas/regresiones Jest del adaptador** (una
  parametrizada con tres estados de PUT): inicio 202
  con XML plausible, parte 206 con ETag plausible,
  `CompleteMultipartUpload` 202 con XML válido,
  PUT simple 202/204/206 y abort 202 reintentable.
- **5 casos localhost HTTP firmados SigV4 B87**, que
  simulan los estados del proveedor en cada etapa:
  objeto quizá persistido tras PUT 202, inicio 202
  sin autorización para subir partes, UploadPart 206,
  commit de bytes seguido de Complete 202 sin borrado
  privado y abort 202 seguido de 204 con el mismo ID.
- Runner y guards B104–B112 actualizados para un
  inventario de **49 escenarios B86–B113**. B107
  continúa exigiendo Node24, TAP completo, sin skips
  ni resultados sintéticos para habilitar release.

### Evidencia real ejecutada

Sobre **Node22.16.0** se ejecutó
`node --experimental-strip-types --test`:
**8/8 PASS, 0 failed/skipped/todo**. Los dos archivos
probados se cotejaron usando Git blob hashes idénticos
a GitHub:

- Helper TS `5ca776c15c9b0bcb2cbb3a35334c4c873c61f489`.
- Tests B113 `a381b6d487f0af46f85ac017d5b1f972c617ed86`.

Esta ejecución demuestra el contrato de estados reales
de Fetch/Node pero **no** equivale al HTTP firmado de la
aplicación ni a una integración AWS/MinIO.

### Comandos para el checkout canónico

```sh
pnpm test:account-export-b113-write-ack
pnpm test:account-export-b107-release-acceptance
pnpm test:account-lifecycle-contract
```

## Aceptación pendiente

**No se ejecutaron** aquí los 49 escenarios firmados
sobre el adaptador real Node24/pnpm9, Nest/Jest,
typecheck/lint, Mongo réplica B94, S3/MinIO con
permisos IAM y limpieza/lifecycle configurados,
backup/restore, navegador y auditorías #133/#141.

**#353 permanece OPEN/HOLD.** Un estado 200 sin
XML válido y sin readback tampoco constituye un GO.
