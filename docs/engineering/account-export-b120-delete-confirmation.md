# B120 — DeleteObject S3: confirmación terminal, no aceptación 2xx ambigua

**Base:** `main@1caf9e0f24f364dbc80d0033304d70b521f766bd` (B119).
**Estado productivo:** issue #353 `OPEN/HOLD`, `STUDY_PROGRESS_ENABLED=false`.
**Sin despliegue ni CI manual.**

## Defecto productivo

En `createS3ObjectStorage`, la operación `deleteObject()` devolvía
éxito cuando `response.ok` era verdadero, es decir, **cualquier 2xx**.
Para limpieza de exportaciones privadas, eso permitía dar por borrada una
generación después de **HTTP 202 Accepted** (posible ejecución diferida)
o **206 Partial Content** (no confirma un DeleteObject terminal). El
borrado puede haber ocurrido o no en el proveedor, de manera ambigua.
La cola huérfana owner-fenced B78–B81 debe conservar autoridad para decidir
el reintento, sin que el adaptador anuncie éxito falso.

## Corrección integrada

Se añadió `isConfirmedS3ObjectDelete(status)` a
`s3-write-ack-status.ts` y el adaptador lo usa **en vez de `response.ok`**.
La confirmación terminal acepta exclusivamente:

- `204 No Content`: respuesta estándar de DeleteObject AWS S3.
- `200 OK`: compatibilidad comprobable con algunos proveedores S3.
- `404 Not Found`: idempotencia; el objeto ya no existe.

Las demás respuestas, incluyendo `201/202/205/206/207`, `403` y
`503`, originan un error de almacenamiento. **No se introduce retry
automático**, no se borra otro objeto, no se altera el orden del
procesamiento ni el algoritmo de selección de generaciones.

La confirmación multipart `AbortMultipartUpload` sigue siendo
independiente; preserva reglas B113 y sus identificadores `uploadId`.
La semántica DELETE **no reemplaza** la verificación SHA-256 de
exportaciones ni la autorización Mongo por propietario.

## Cobertura agregada

- **5 casos nativos Node** para 200/204/404, 202/206,
  éxitos aparentes, errores y estados inválidos.
- **Jest sobre el adaptador real** para rechazar 201/202/205/206/207,
  conservar 200/404 e identificar correctamente una única solicitud.
- **2 grupos de tests HTTP firmados** sobre TCP localhost, reales
  en su ejecución prevista: para 202/206, la fixture puede conservar
  o eliminar los bytes antes de devolver el ACK ambiguo. La
  aplicación debe rechazar ambas variantes sin reintento automático;
  en 200/204/404 debe aceptar una única confirmación terminal.
- El runner original B101/B107 exige ahora **61 casos únicos firmados**
  (59 anteriores + 2 B120). Los guards B104–B119 se reconcilian con el
  nuevo conteo. El comprobante local B118 también exige `61/61` y
  no puede aceptar una transcripción anterior de `59/59`.

## Evidencia ejecutada y límites

Se ejecutó `node --experimental-strip-types --test` en
**Node 22.16.0**, sobre la copia byte a byte de los dos archivos
de prueba comparados con Git mediante `git hash-object`:
- `s3-write-ack-status.ts`: `980162a27107547e4055e1269800e56a0be55b5a`
- `test-account-export-b120-delete-confirmation.test.mjs`:
  `5b66596e945daa4576bb6297f90bc15802081fbf`

Resultado **5/5 PASS**, cero fails, skips, TODO o cancelled. La ejecución
Node22 del helper es **diagnóstica** y no reemplaza los **61 tests TCP
firmados en Node24**, Jest/Nest, Mongo réplica B94, proveedor S3/MinIO
con IAM/lifecycle, backup/restore, browser, lint/typecheck/build y
auditorías #133/#141.

## Comandos en checkout con Node24 y pnpm9

```sh
pnpm test:account-export-b120-delete
pnpm test:account-export-b120-signed-delete
pnpm test:account-export-b107-release-acceptance
pnpm test:account-lifecycle-contract
```

No levantar `validateRuntimeEnvironment`, no activar Study Progress ni
dar por liberado #353. **HOLD**.
