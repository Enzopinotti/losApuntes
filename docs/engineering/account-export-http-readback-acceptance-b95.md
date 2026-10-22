# B95 — Aceptación HTTP S3 real del readback B90 y streaming B91

**Base:** `main@e72a258c4bd60388d7b30fe79e16fe58ddfb8692` (B94).  
**Release:** issue #353 OPEN/HOLD; `STUDY_PROGRESS_ENABLED=false`; no CI manual ni despliegue.

## Brecha concreta

La suite de B86/B87 levanta un servidor HTTP loopback (`127.0.0.1`, puerto efímero) y utiliza el **adaptador S3 real** de `apps/api/src/files/storage/s3-object-storage.ts` para firmar SigV4 y ejecutar PUT/GET/DELETE. Sus casos cubren transferencia, ACK perdido, abort multipart y firma manipulada.

B90 y B91 incorporaron los verificadores productivos `verifyAccountExportStoredBytes` y `verifyAccountExportDownload`, pero no había pruebas que ejercitaran ambos con respuestas **HTTP reales del adaptador S3** y cuerpos de proveedor alterados después de una firma legítima. Los tests puros Node y los mocks `fetch` de Mongo no prueban esa unión.

## Implementación

Se extendió únicamente el servidor local B86/B87; no se modificó API, DB, interfaz pública, controlador, IAM ni transporte S3 productivo. `withLoopback({getFaults:[...]})` aplica una secuencia explícita de fallos a cada GET **después** de validar la firma del request con el verificador SigV4 independiente B87. Todos los fallos quedan limitados al objeto de prueba exacto, sin credenciales externas y sin conectar a S3 real.

Se agregaron seis tests B95 al script HTTP preexistente:

1. PUT firmado, primer GET íntegro verificado por B90 y segundo GET íntegro transmitido por B91. Se exige `PUT → GET → GET` y mismos bytes.
2. GET HTTP 200 con **corrupción de un byte sin cambiar tamaño**: B90 rechaza SHA-256, sin borrar el objeto.
3. GET HTTP 200 con cuerpo **truncado**: B90 rechaza tamaño, sin borrar.
4. GET HTTP 200 con cuerpo **más grande**: B90 detiene lectura por límite esperado, sin borrar.
5. GET HTTP 404 o 503: el adaptador firmado propaga el estado y el verificador falla cerrado; los bytes originales permanecen.
6. Primer GET íntegro (B91 preflight), segundo GET alterado sin cambiar tamaño: el verificador productivo del stream rechaza al finalizar, y el test documenta que **los bytes ya transmitidos no pueden retirarse**. No afirma que el controlador pueda revocar una respuesta ya empezada.

Los ocho tests originales B86/B87 se conservan. Se agregó `test:account-export-b95-http-integrity` para seleccionar específicamente B95 y `test-account-export-b95-http-integrity-guard.mjs` para comprobar cobertura y cadena principal. El comando general `test:account-lifecycle-contract` ya ejecuta el HTTP loopback completo; ahora incluye además la nueva guarda B95.

## Cómo ejecutarlo

Desde la raíz del repositorio, con Node 24 y pnpm 9:

```bash
pnpm test:account-export-b95-http-integrity
pnpm test:account-export-b86-s3-loopback
```

La ejecución usa únicamente `127.0.0.1` con puerto efímero y claves ficticias. No necesita MongoDB ni S3 externo. Después, para el conjunto de cinco escenarios durables (B94), ejecutar en forma separada con un replica set descartable local:

```bash
STUDY_PROGRESS_ENABLED=false \
STUDY_PROGRESS_TEST_MONGO_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0' \
pnpm test:account-export-b86-local-acceptance
```

El segundo comando requiere Mongo real y **simula** el transporte HTTP S3 dentro de Jest. Ninguno de los dos demuestra la semántica real de AWS/MinIO, IAM, versionado, Object Lock, lifecycle, backup/restauración ni pruebas de descarga Fastify/navegador.

## Evidencia y límites

La verificación por inspección de fuente y análisis sintáctico no constituye una ejecución de TCP, Nest ni Mongo. Los seis nuevos tests están incorporados para ejecutar en el checkout adecuado; hay que obtener su resultado PASS real antes de declararlos aprobados. El único endpoint al que apunta la suite es localhost; no se disparó CI manual.

B95 **no elimina** la ventana entre dos GET ni sustituye el control de permisos. La aceptación final de #353 continúa HOLD junto a las auditorías #133/#141, Node24/pnpm9, tests API/Jest/typecheck/lint, Mongo replica set y S3 de proveedor.
