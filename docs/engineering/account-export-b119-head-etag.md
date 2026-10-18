# B119 — ETag estricto en HEAD S3 y aceptación HTTP firmada

**Base:** `main@0d654e6dc453872961e89a59a431857fbe1433dc` (B118).  
**Release:** issue #353 `OPEN/HOLD` y `STUDY_PROGRESS_ENABLED=false` en producción. No CI manual ni despliegue.

## Defecto confirmado

`S3ObjectStorage.headObject()` ya exigía HTTP 200 y Content-Length
canónico desde B116, pero seguía normalizando la cabecera `ETag` con
`replace(/^"|"$/gu, '')`: retiraba comillas inicial/final
**independientemente** y aceptaba `"unbalanced`, `unbalanced"` e
incluso comillas internas. El ETag devuelto puede guardarse como
metadata de un asset cuando FileService lo marca `scan_pending`.

B108 había corregido exactamente esa clase de ambigüedad para
`UploadPart`; B119 reutiliza ese contrato productivo de tokens ASCII
imprimibles, comillas equilibradas y máximo de 256 caracteres de cabecera,
en lugar de definir una segunda normalización incompatible.

## Comportamiento nuevo

- Nuevo `normalizeS3HeadObjectEtag(raw)` devuelve `null` si S3
  omite **por completo** el encabezado, preservando proveedores
  compatibles (ETag es metadata opcional en `ObjectStorageHead`).
- Si el encabezado existe, se delega a
  `normalizeS3MultipartPartEtag` de B108: sin comillas
  desbalanceadas, embedded quotes, backslashes, controles, espacios
  internos, bytes fuera de ASCII ni tokens gigantes.
- Si existe y es inválido, HEAD falla con error genérico antes de
  confirmar metadata; no se persiste ETag malformado.
- Los ETags válidos pueden estar entrecomillados (incluido formato
  multipart con sufijo `-N`) o sin comillas para proveedores S3
  compatibles. Se preserva el token opaco sin alterar su contenido.
- No cambia firma SigV4, claves S3, permisos, DELETE owner-fenced B80/B81,
  HEAD status/tamaño B116, GET/SHA256 B90, ni los flags productivos.

**Límite:** un ETag sintácticamente válido no prueba contenido ni
integridad criptográfica; el readback SHA-256 de B90 sigue siendo
independiente y obligatorio para las exportaciones privadas.

## Pruebas agregadas

- **5 pruebas nativas** del contrato HEAD, ejecutables con Node
  `--experimental-strip-types` + resolver TS local: encabezado
  ausente, tokens válidos, comillas irregulares, controles/
  whitespace y exceso de longitud.
- **Regresiones Jest** del adaptador real: HEAD 200 con ETag inválido
  rechaza, HEAD sin ETag continúa admitido, tokens multipart/compatibles
  se conservan correctamente.
- **2 nuevos grupos de integración TCP localhost** B119 contra
  `createS3ObjectStorage` y verificación independiente B87 SigV4:
  rechaza cinco valores inválidos tras un PUT privado, sin DELETE ni
  cambios de bytes; acepta dos tokens válidos y la ausencia opcional.
- El runner B101/B107 exige ahora **59 grupos top-level distintos**
  (57 históricos + 2 B119) en Node24, TAP sin skips/TODO.
- Guards B104–B115 y B117, más el comprobante exact-head B118,
  evolucionan a 59 casos para impedir que un `57/57` histórico
  sea certificado como la aceptación vigente.

## Evidencia aislada ejecutada (Node 22.16.0)

Los archivos nativos B119 se copiaron a un directorio aislado, se
cotejaron uno por uno mediante `git hash-object` con sus Git blobs
exactos de la rama y se ejecutaron con el resolver TS B101 original:

- `s3-head-etag.ts`: `0c5ff63bb23f242eb4cc287ba1f4b6052ed63560`
- `s3-multipart-part-etag.ts`: `8cda67a10135941442e8d1e6e50076f9500f7269`
- `test-account-export-b119-head-etag.test.mjs`: `6562e76ad7957c8fdae8286a28ec794e94c4b6cd`
- Resolver TS B101 y registrador: hashes exactos `d82804f4cad1e9083dd931c8179358f978a81982` y `6d334d834d12da07f7c1c57ea2d9efc23e889201`.

**Red/green real:** la primera ejecución reveló que el trim del
parser B108 permitía `abc\\u00a0` (NBSP al final): 4/5 PASS,
1 FAIL. Se agregó a la validación HEAD un chequeo previo de
ASCII imprimible sobre el encabezado original. La nueva ejecución
del mismo suite alcanzó **5/5 PASS, cero skips, failures y TODO**.

Adicionalmente, source guard B119 **8/8 PASS** y los cuatro
callbacks de contrato B118 para aceptación de 59 casos
**4/4 PASS** en V8 aislado. Estas pruebas no constituyen
HTTP TCP integrado ni aceptación productiva Node24.

## Comandos de verificación

```sh
pnpm test:account-export-b119-head-etag
pnpm test:account-export-b119-signed-head
pnpm test:account-export-b107-release-acceptance
pnpm test:account-lifecycle-contract
```

La prueba nativa y source guard **no** significan que haya corrido
la integración HTTP ni el gate de producción. Las 59 pruebas TCP reales
requieren checkout limpio Node24/pnpm9, Jest/Nest, Mongo replica B94,
S3/MinIO IAM/lifecycle, calidad completa, navegador, backup/restore y
auditorías #133/#141. B118 exige ahora prueba Node24 de **59/59**.

**#353 HOLD**. No activar Study Progress ni desplegar.
