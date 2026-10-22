# B96 — Confirmación verificable de multipart S3 aun con HTTP 200

**Base:** B95 `main@a5c3253e9c198e2e13e73e5d2ba3e0b997c85440`.  
**Lanzamiento:** #353 OPEN/HOLD, `STUDY_PROGRESS_ENABLED=false`, sin CI manual ni despliegue.

## Falla concreta

`createS3ObjectStorage().createMultipartWriter().complete()` realizaba `POST ?uploadId=...` y esperaba el XML del proveedor. Ya rechazaba el caso documentado `<Error>` embebido en HTTP 200, pero si el proveedor/proxy contestaba **HTTP 200 con cuerpo vacío, HTML, un XML ajeno a CompleteMultipartUpload o XML de confirmación incompleto**, el writer consideraba terminada la operación (ponía `completed=true` y borraba `uploadId`).

Eso mezcla el transporte HTTP con la confirmación semántica. El error afecta a flujos generales de archivos, no solo a Account Export. Para exportaciones privadas B90 agrega un GET/readback, pero no corresponde depender de ese verificador posterior para que el adaptador genérico deje de aceptar ACK ambiguos.

## Corrección

Nuevo helper de producción `apps/api/src/files/storage/s3-multipart-completion.ts` (`isConfirmedS3MultipartCompletion`) verifica un **envelope XML esperado de `CompleteMultipartUploadResult`**, admitiendo resultados reales con declaración XML/namespace o la forma autocerrada conocida de los fixtures.

Rechaza antes de marcar al escritor como completado:

- cuerpo vacío o whitespace;
- respuestas HTML, JSON o XML ajenas a la finalización;
- `<Error>` embebido, incluso con un prefijo de namespace;
- envelope parcial, XML extra después del éxito, resultados duplicados o entrada excesiva.

En `s3-object-storage.ts`, el paso `writer.complete()` ahora exige **HTTP 2xx y una confirmación XML reconocida**. Si no se confirma, conserva el estado ambiguo y `uploadId` para `abort()`. No borra silenciosamente un objeto que el proveedor podría haber persistido.

Para una exportación privada, `deleteObjectOnAbort:false` de B81 permanece vigente: `abort()` intenta cancelar el identificador multipart **pero nunca emite un DELETE directo del objeto**. B80/B78 siguen siendo autoridad de limpieza durable con fences Mongo. B90/B91 siguen verificando bytes con GET y SHA.

**Alcance técnico:** el helper valida el envelope esperado, no es un parser XML general ni prueba qué bytes se escribieron realmente. Una respuesta formalmente válida pero falsa de un S3-compatible requiere el GET readback de B90 y una aceptación real con el proveedor. La longitud de texto aceptado se limita a 64 KiB después de leer la respuesta, no debe interpretarse como límite de memoria de recepción.

## Pruebas

- `scripts/test-account-export-b96-multipart-response.test.mjs`: **10/10 pruebas Node ejecutadas y PASS**, con Node 22.16.0, contra código idéntico por Git SHA al helper y test en GitHub. Cubre XML real de AWS, fixture autocerrado, cuerpo vacío, HTML/XML ajeno, errores embebidos, respuesta incompleta, duplicación de documentos, BOM/declaración y entradas inválidas.
- `apps/api/src/files/storage/s3-object-storage.spec.ts`: casos Jest de `complete()` con HTTP 200 ambiguo más `abort()` privado; comprueba que la única petición DELETE lleve `uploadId`.
- `scripts/test-account-export-b86-s3-loopback.test.mjs`: nuevo caso B96 de red HTTP real con firma SigV4, respuesta multipart 200 vacía/error/HTML simulada **después de persistir el objeto**, con objeto aún existente después de `abort()`. Preserva ocho casos B86/B87 y seis casos B95.
- `scripts/test-account-export-b96-guard.mjs`: contrato de source sobre verificador, semántica de commit, abort y cobertura. Se incorpora a `test:account-lifecycle-contract` y comando independiente.

Los Jest y HTTP completos todavía **no se ejecutaron** en el entorno disponible; Node 24/pnpm y dependencias de repo siguen faltando. Esto tampoco acredita Mongo replica set, proveedor AWS/MinIO, IAM/versionado, backup, HTTP/browser ni auditorías #133/#141.

## Ejecución posterior requerida

```bash
pnpm test:account-export-b96-multipart
pnpm test:account-export-b86-s3-loopback
pnpm --filter @losapuntes/api test:ci --runTestsByPath src/files/storage/s3-object-storage.spec.ts
```

Continuar con la matriz durable B94 contra Mongo local y la aceptación S3 del proveedor. No levantar #353 ni activar producción sin evidencia ejecutada.


## Vigencia tras B103

B103 eliminó la excepción inicial B96 que aceptaba respuestas autocerradas de
un fixture de pruebas como éxito HTTP 200. El adaptador actual exige ETag
semánticamente no vacío y el fixture B86 fue actualizado. Ver
`account-export-b103-confirmed-s3-etag.md`.
