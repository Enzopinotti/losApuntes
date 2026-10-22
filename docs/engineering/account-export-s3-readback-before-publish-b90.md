# B90 — Verificación de bytes S3 antes de publicar una exportación privada

**Base:** `main@062ca15958ceb4f7d7559ccd46e1b6f454e4b886` (B89).  
**Release:** issue #353 OPEN/HOLD, `STUDY_PROGRESS_ENABLED=false`, no CI manual ni deploy.

## Falla detectada

La exportación JSON se ensambla por streaming y su resultado incluye `byteLength` y `sha256`. El sink previo a B90 comparaba correctamente esos valores **contra los bytes que la aplicación enviaba**, pero solo esperaba un ACK de `PUT Object` o `CompleteMultipartUpload` antes de resolver `commit()`.

Una respuesta HTTP exitosa **no prueba** por sí sola que los bytes efectivamente persistidos por un proveedor S3/S3-compatible estén íntegros, disponibles y coincidan con el artefacto local. Si el almacenamiento guarda un cuerpo truncado o alterado y entrega éxito, la base Mongo podía marcar la exportación como `completed` y publicar su referencia a un objeto imposible de descargar de forma íntegra.

## B90 — write, readback, publish

`S3AccountExportArtifactStorage.createSink(...).commit(result)` conserva la validación local de versión, inventario, longitud y hash y agrega un paso obligatorio **entre** `writer.complete()` y `state = 'committed'`:

1. El mismo object key privado `exports/<job-uuid>/<generation-uuid>.json` se lee por `storage.readObjectChunks(key)`, utilizando un GET S3 autenticado de lectura en streaming.
2. `verifyAccountExportStoredBytes` calcula la longitud acumulada y SHA-256 de los bytes *devueltos por el proveedor* sin guardar el JSON completo en RAM. Rechaza metadata inválida, chunks no binarios, cuerpo más largo que lo esperado (antes de seguir leyendo), respuesta truncada, digest incorrecto y errores de GET.
3. **Solo** al comparar exitosamente longitud y hash (comparación binaria de hash de tiempo constante) `commit()` retorna y el `AccountExportProcessor` puede intentar `store.complete()` contra Mongo.
4. Si `GET` falla o los datos difieren, el sink queda sin confirmar. El worker trata el fallo como un intento fallido, reprograma a través del CAS Mongo y utiliza el ledger durable de generaciones B80. B81 mantiene `deleteObjectOnAbort:false`; **no hay DELETE inmediato** después del ACK.
5. Los mecanismos de B82/B83/B84/B85 (propietario, fecha, lease, generación y retención) permanecen vigentes. La lectura extra añade latencia/ancho de banda por exportación; se prioriza no entregar un archivo corrupto como `completed`.

## Pruebas

- **Ejecutadas realmente:** `node --experimental-strip-types --test scripts/test-account-export-b90-readback.test.mjs`: 9/9 PASS con Node 22.16 y hashes Git idénticos al archivo fuente puro y al test publicados en la rama. Cubre lectura particionada, vacía, truncada, corrupta mismo tamaño, exceso de bytes con cierre temprano, metadata inválida, chunks erróneos, error midstream y chunks vacíos.
- Jest del almacenamiento privado: se actualizaron fixtures de v1/v2/v3 que antes respondían con GET vacío, y se sumaron fallos de truncamiento, corrupción misma longitud y error HTTP al recuperar.
- Mongo replica-set opt-in + adaptador S3: prueba B90 con PUT 200 seguido de GET 200 manipulado; la exportación no se publica, el objeto queda para el limpiador y la fila B80 ya persistida se conserva. Test de B86 de exportación publicada ahora debe observar `PUT → GET` antes de `complete`.
- `scripts/test-account-export-b90-readback-guard.mjs` verifica el orden real de ejecución, el circuito sin DELETE inline y el cableado de la cobertura; el test runnable se incluye en `test:account-lifecycle-contract`.

Los tests Jest y Mongo/S3 de aceptación **no** se ejecutaron en este entorno. Las nueve pruebas locales del algoritmo no prueban IAM/ACL, comportamiento de un S3 real, replica set, failover, versioning ni lectura de un objeto modificado **después** de la verificación. Un cambio de objeto posterior requiere hardening de permisos para que solamente el servicio pueda escribir en su generación y se habiliten inmutabilidad/versionado si aplica. Para producción son obligatorios Node24/pnpm9, Jest/typecheck, pruebas reales con Mongo y S3, backups, lifecycle, IAM, auditorías #133/#141 y smoke HTTP/browser.

Mantener `STUDY_PROGRESS_ENABLED=false`, #353 HOLD, sin waiver ni CI manual.

## Carriles

#399/#400/#402/#403/#404/#405 y otras PRs superpuestas deben rebasear exact `main` y conservar tanto el `S3AccountExportArtifactStorage` de B90 como las nuevas expectativas GET en `study-progress.mongo-int.spec.ts`; no sobrescribir con snapshots B86 donde un PUT era suficiente para publicar el artefacto.
