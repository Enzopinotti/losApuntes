# B114 — GET de objeto completo no admite HTTP parcial y respeta AbortSignal

**Base:** `main@e2307fcda9bbc979320b22d09b7c488016502591` (B113).  
**Lanzamiento:** issue #353 OPEN/HOLD, `STUDY_PROGRESS_ENABLED=false`. Sin CI manual ni despliegue.

## Defecto funcional confirmado

`S3ObjectStorage.readObjectChunks()` hacía un GET firmado de **objeto completo, sin encabezado Range**, pero aceptaba `response.ok`: para Fetch cualquier 2xx es exitoso, incluido `206 Partial Content` o `202 Accepted`. Por eso podía entregar bytes de una respuesta parcial a lectores como los escáneres de archivos y el readback. Este último todavía verifica SHA256 (B90), pero otros consumidores no deben recibir fragmentos ajenos como un objeto completo.

Adicionalmente, si un `AbortSignal` cancelaba el `ReadableStream` durante una lectura pendiente, `reader.read()` podía resolver `{done:true}`; el generador consideraba el stream completado correctamente y un consumidor podía confundir **cancelación** con EOF normal.

## Corrección de producción

Se añade `s3-full-object-read-contract.ts` con dos funciones puras utilizadas por el adaptador:

- `isConfirmedS3FullObjectGet(status)`: solo **HTTP 200** confirma GET de objeto completo. `202`, `204`, `206` y todo otro estado distinto de 200 se rechazan antes de entregar bytes al consumidor. Si existe cuerpo de error, se intenta cancelar sin ocultar el fallo.
- `assertS3FullObjectReadActive(signal)`: si el llamador abortó, siempre lanza un **`DOMException` con `name='AbortError'`**. Se verifica al iniciar la lectura, antes y después de `reader.read()` (incluido antes de aceptar un posible EOF), y entre fragmentos del mismo chunk de red.
- Se conserva la cancelación del reader y el retiro del listener `abort` en `finally`, y el tamaño máximo de cada chunk de salida. Se rechazan chunks que no sean `Uint8Array`.
- **Sin cambio** en `readPrefix()`: los 206 válidos siguen verificándose contra `Content-Range` exacto por B111; esta corrección afecta exclusivamente los GET de **objeto completo sin Range**.
- SigV4 B110/B112, validaciones de bytes B90, generación privada y limpieza owner-fenced B80/B81 permanecen intactos.

## Regresiones

- **7 pruebas nativas B114**: únicamente HTTP 200 para GET completo; 206 con encabezado creíble; 202; cancelación con `AbortError`, incluso con motivos primitivos; camino sin señal; estados inválidos.
- **Jest** en el adaptador: GET completo 202/206 con cuerpo que no se debe emitir (cancelado); aborto entre chunks produce `AbortError`; el antiguo test que aceptaba EOF luego de abortar se corrige para exigir rechazo.
- **2 casos HTTP localhost con firma SigV4 independiente B87**: proveedor devuelve HTTP206 a un GET completo sin Range y no se altera la generación privada; cancelación luego del primer fragmento rechaza la segunda lectura, sin DELETE Object.
- Inventario firmado **51 casos B86–B114**, obligatorio en Node24 mediante TAP anti-skips B107. Guard B114 nuevo, comandos y documentación operativa.

## Evidencia realmente ejecutada

Se ejecutó `node --experimental-strip-types --test` con **Node22.16.0** sobre los archivos nativos exactos recuperados de GitHub, comprobados por `git hash-object`:

- Helper `7874bf8c941475dc136245f816eb6db42cd6c588`
- Test `f471560511f5fef0e3d2fe2287adeb9d72457a41`

**Resultado 7/7 PASS, 0 fallos, skips, cancelled y TODO**.

Esta evidencia prueba el contrato de estado y cancelación del helper TypeScript, **no** la ejecución del adaptador en TCP o la aceptación Node24. Las pruebas HTTP firmadas y Jest se añadieron pero aún requieren ejecución integral.

```sh
pnpm test:account-export-b114-full-get
pnpm test:account-export-b107-release-acceptance
pnpm test:account-lifecycle-contract
```

**Pendiente:** ejecutar 51 casos HTTP TCP SigV4 en checkout canónico Node24/pnpm9, Nest/Jest, typecheck/lint, Mongo réplica B94, AWS/MinIO con IAM/lifecycle, backup/restore y auditorías #133/#141. La issue #353 queda **HOLD**, sin habilitar ni desplegar.
