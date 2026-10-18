# B116 — HEAD S3 con confirmación estricta y Content-Length canónico

**Base verificada:** `main@fe01277cdb85612c860777cad0a8745f1f04c936` (B115).  
**Lanzamiento:** #353 OPEN/HOLD; `STUDY_PROGRESS_ENABLED=false`. No CI manual ni deployment.

## Defecto de integración

`S3ObjectStorage.headObject()` reconocía 404 como objeto ausente, pero luego aceptaba `response.ok` (cualquier HTTP 2xx) para confirmar metadatos de objeto completo. Un gateway S3 defectuoso o intermediario podría devolver 202 Accepted, 204 No Content o 206 Partial Content con un `Content-Length` numérico: el adapter lo trataría como un objeto existente y apto para validación posterior.

La conversión anterior `Number(rawLength)` también aceptaba algunos formatos ambiguos como cadena vacía, ceros a la izquierda y notación exponencial. Un resultado falso en HEAD afecta flujos que dependen de tamaño y metadatos del objeto, incluida la revalidación de uploads y artefactos privados.

## Corrección B116

- Respetar `404 -> null` como antes. Un objeto solo queda confirmado con HTTP **200**; otro estado devuelve error, incluso si es 2xx.
- `parseS3HeadObjectByteSize()` exige `Content-Length` presente, decimal canónico no negativo y entero seguro. Rechaza faltantes, vacíos, formatos duplicados, enteros inseguros, CRLF y exponentes.
- Mantener `Content-Type`, normalización histórica de ETag y la firma SigV4 HEAD existentes; no modificar URLs firmadas, autorización, grants, objeto ni base de datos.
- Errores genéricos sin registrar headers ni bytes privados; el servidor sigue siendo autoridad.

## Pruebas

- Seis pruebas nativas B116 (`node --experimental-strip-types --test scripts/test-account-export-b116-head.test.mjs`) para estados HTTP, cero y entero seguro, ausencias, formatos numéricos ambiguos, headers duplicados e integer overflow.
- Regresiones del adapter Jest: 202/204/206 rechazados aun con Content-Length aparentemente correcto, formatos de tamaño inválido, confirmación 200/404 conservada.
- Comando de test B116 y cadena `test:account-lifecycle-contract` actualizados.

## Evidencia y límites

Los tests nativos son prueba del helper, no demuestran interacción con servidor S3 ni transacciones Mongo. Los **53 escenarios firmados B86–B115** permanecen definidos y pendientes de ejecución Node24; B116 no cambia el protocolo de solicitud ni agrega casos a la batería TCP hasta poder ejecutar el runner completo. La validación integral en Node24/pnpm, Jest, Mongo réplica, storage real, calidad y auditorías #133/#141 sigue pendiente. No levantar el HOLD ni habilitar Study Progress por un test aislado.
