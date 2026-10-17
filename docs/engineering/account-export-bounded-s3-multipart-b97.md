# B97 — Límite de 64 KiB aplicado durante la recepción de CompleteMultipartUpload

**Base:** `main@994b5fc1e04ef5a1d2c53f3e6c83edb897f2c069` (B96).  
**Release:** issue #353 OPEN/HOLD, `STUDY_PROGRESS_ENABLED=false`, sin CI manual ni despliegue.

## Falla real

B96 endureció la validación semántica de los mensajes de finalización S3. El helper `isConfirmedS3MultipartCompletion(xml)` rechaza resultados mayores a 64 KiB. No obstante, el adaptador todavía hacía:

```ts
const xml = await response.text();
```

Por lo tanto, **el cuerpo entero ya estaba cargado en memoria** cuando llegaba al límite. Un servidor S3-compatible, proxy o backend fallido puede emitir HTTP 200 con un body muy grande o incluso seguir transmitiendo sin fin, aumentando uso de memoria y demora en un proceso que atiende solicitudes concurrentes.

## B97 implementado

Nuevo helper de producción `apps/api/src/files/storage/s3-multipart-response-body.ts`:

- Consume `Response.body.getReader()` en streaming, acumula el tamaño real en **bytes** y rechaza cualquier chunk que exceda el saldo del límite **antes de decodificarlo o agregarlo al XML**.
- El máximo es exactamente `64 * 1024 = 65 536 bytes`; se admiten hasta ese valor y se rechaza el siguiente byte, independientemente de si `Content-Length` existe, es falso o el servidor usa transferencia fragmentada.
- Rechaza respuestas sin body, chunks que no sean `Uint8Array`, UTF-8 inválido y secuencias multibyte truncadas, utilizando `TextDecoder('utf-8', { fatal: true })` incremental (permite secuencias UTF-8 fragmentadas entre lecturas).
- Intenta cancelar `reader` ante exceso de datos/error y libera su lock en `finally`. Los fallos de cancelación no sobreescriben el error original.
- Después de la lectura limitada sigue exigiendo el envelope semántico validado por B96. Un body dentro del límite tampoco concede permiso si su XML es inválido.

En `S3ObjectStorage.createMultipartWriter.complete()`, la recepción pasa a ser **HTTP 2xx → lectura con límite físico → confirmación B96 → writer committed**. Para respuestas no 2xx se evita leer el cuerpo completo y se intenta cancelar la transmisión. En errores el `uploadId` no se borra. El `abort()` de exportaciones privadas continúa siendo **multipart-ID only**, sin DELETE desnudo del objeto; las tareas de limpieza B80/B78 siguen siendo autoridad con fences por dueño/generación.

## Evidencia de pruebas efectivamente ejecutadas

`scripts/test-account-export-b97-bounded-multipart.test.mjs`: **12/12 Node22 PASS**, ejecutados en container con archivos byte-idénticos a GitHub, verificados mediante `git hash-object`:

- Helper de producción: `8621006edc4c662e7f000712ed879bf3f9abb886`.
- Suite Node: `f0017ba095a5a5897bc3e5b5407c174054e73045`.

Cubren: XML normal dividido, límite exacto, exceso en uno o varios chunks, cancelación y fallo de cancelación, ausencia de body, UTF-8 incorrecto, multibyte partido entre chunks, stream fallido y chunks no binarios. **Una prueba usa HTTP real a `127.0.0.1` con puerto efímero y un cuerpo HTTP 200 de más de 64 KiB.** No utiliza credenciales ni servicios remotos.

También se incorporaron (aún sin ejecutar en el checkout completo):
- Jest del adaptador S3 con respuesta HTTP 200 demasiado grande y UTF-8 inválido; se conserva la cancelación del uploadId privado sin borrar el objeto.
- Un escenario firmado HTTP en la suite B86/B95/B96 que responde con más de 64 KiB **después de simular que el objeto fue persistido**, y verifica que `abort()` no ejecute DELETE Object.
- `scripts/test-account-export-b97-guard.mjs`, nueva verificación de integración de los verificadores, orden y preservación de B96/B81. Se agrega al root `test:account-lifecycle-contract`.

## Comandos

```bash
pnpm test:account-export-b97-multipart
pnpm test:account-export-b86-s3-loopback
pnpm --filter @losapuntes/api test:ci --runTestsByPath src/files/storage/s3-object-storage.spec.ts
```

Los últimos dos comandos requieren checkout completo, Node24/pnpm9 y dependencias. **No declarar aprobados** Jest ni S3 HTTP firmado hasta ejecutarlos. El HTTP local de la suite Node no constituye aceptación de firmas SigV4 ni de AWS/MinIO.

## Alcance y límites

El límite impide **retener o acumular** un cuerpo de respuesta de longitud ilimitada; no puede impedir que la pila HTTP subyacente reciba temporalmente un chunk más grande que 64 KiB antes de entregarlo al consumidor. Los timeouts de red del adaptador siguen siendo necesarios. B90 readback SHA y todos los controles de owner/lease/revalidación B91–B93 permanecen intactos.

La issue #353 continúa HOLD; quedan pendientes Node24/pnpm9, tests API/Jest/TypeScript/lint, replica set Mongo, proveedor S3 AWS/MinIO/IAM/versionado, pruebas HTTP/browser, backup/retención y auditorías #133/#141. No se activó la feature ni CI manual.
