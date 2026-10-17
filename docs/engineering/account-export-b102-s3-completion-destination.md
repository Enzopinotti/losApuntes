# B102 — Finalización multipart S3 vinculada a bucket y clave del objeto

**Base exacta:** `main@7076c0a5a971d1088b5357b5ae1f74b78ac6cf6f` (B101).  
**Release:** #353 OPEN/HOLD, `STUDY_PROGRESS_ENABLED=false`; sin CI manual ni despliegue.

## Hallazgo

B100 exigía que el resultado XML de **inicio** S3 se vinculara al bucket/clave
esperados. Sin embargo, B99 validaba solamente que la respuesta XML de
**finalización** HTTP 200 estuviera estructurada y contuviera ETag; podía
aceptar `<CompleteMultipartUploadResult><Bucket>tercero</Bucket><Key>otra-generacion</Key>...</...>`.
Esta asimetría dejaba al writer local marcar `completed=true` ante un
resultado de otro objeto. B90 readback SHA-256 seguía protegiendo la
publicación, pero no corresponde delegarle la autenticidad del ACK.

## Cambio

El helper existente `isConfirmedS3MultipartCompletion(xml, expected?)`
compara, tras validar XML y decodificar entidades válidas, los campos
`Bucket` y `Key` retornados por el proveedor con `options.bucket` y
`input.objectKey`. Un mismatch explícito es **FAIL cerrado**, antes de
`uploadId=null` y `completed=true`.

Se conserva el contrato histórico de proveedores/fixtures que omiten
`Bucket`/`Key` y la forma autocerrada B86. La ausencia de estos campos
no certifica una identidad de proveedor: B90 debe seguir comprobando
el GET y SHA-256 exactos antes de publicar el archivo privado.

## Pruebas y regresiones

- Suite Node independiente `test-account-export-b102-completion-binding.test.mjs`:
  claves correctas, entidades `&amp;` y numéricas, bucket/clave ajenos,
  doble encoding, omisiones compatibles y XML rechazado.
- Jest del adapter: HTTP 200 con bucket o key ajenos conserva abort por uploadId
  y `deleteObjectOnAbort:false`.
- HTTP localhost **con firma SigV4 independiente B87**: prueba explícitamente
  una finalización falsa tras haber almacenado el objeto y comprueba que no
  existe `DELETE Object` no autorizado.
- Fixture positivo B99 corregido para devolver la identidad del objeto real,
  no un bucket/key de relleno.
- Guards B96/B97/B99/B100 reconciliados con la nueva firma y guard B102.

```sh
pnpm test:account-export-b102-binding
pnpm test:account-export-b101-signed-http
pnpm test:account-lifecycle-contract
```

**Evidencia aislada:** se ejecutaron 20/20 callbacks de tests (10 B96, 5 B99 y
5 B102) sobre los blobs GitHub verificados, quitando únicamente anotaciones TS
para ejecutarlos en V8. No es ejecución del runner Node24/pnpm9. Esto **no** reemplaza la suite Node24/pnpm9 del checkout
canónico, el Jest real, Mongo replica B94 o S3 externo. La batería de 23
casos HTTP firmados permanece pendiente de ejecutar íntegra y comprobar
con su runner TAP anti-skips.

Se mantienen B80/B81 cleanup owner-fenced, B90/B91 integridad SHA-256, B92/B93
reautorización y B96–B101 límites/errores/compatibilidad.
No habilitar producción antes de las aceptaciones de #353.


## Vigencia tras B103

La compatibilidad B102 con el resultado multipart autocerrado se retiró en B103.
El simulador B86 emite ahora `<CompleteMultipartUploadResult>` con ETag. Las
respuestas que omiten Bucket/Key pero incluyen ETag significativo conservan el
comportamiento documentado, bajo B90 readback y #353 HOLD.
