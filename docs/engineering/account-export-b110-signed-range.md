# B110 — Firmar el encabezado Range en S3 GET SigV4

**Base:** `main@d13da714d17762694fe4df74fc8fc0fd2e526eb5` (B109).  
**Release:** #353 OPEN/HOLD, `STUDY_PROGRESS_ENABLED=false` en producción.
No ejecutar CI manual, no desplegar.

## Defecto productivo

El método `signedRequest` de `s3-object-storage.ts` hacía:
- Solicitud GET con `headers.range = 'bytes=0-N'` para `readPrefix`.
- CanonicalRequest SigV4 con únicamente
  `host;x-amz-content-sha256;x-amz-date` en `SignedHeaders`.
- Envío de `Range` por HTTP **sin incluirlo en el material firmado**.

La implementación B109 ya frenaba una respuesta demasiado grande antes
de copiarla en memoria, pero **no autenticaba qué ventana de bytes
había solicitado la aplicación**. Un proxy que cambiara Range no
invalidaba la firma: el verificador independiente B87 aceptaba
la petición siempre que los demás encabezados firmados coincidieran.

## Corrección

Se agrega un helper puro
`collectS3SignedRequestHeaders(host, hash, date, additional)`
en `apps/api/src/files/storage/s3-signed-request-headers.ts`,
usado por el verdadero `signedRequest()` antes del canonical request.

- Todo encabezado adicional (actualmente `range` en `readPrefix`)
  se normaliza a nombre ASCII en minúsculas, se normaliza su whitespace
  para SigV4 y se agrega a `SignedHeaders`.
- Se prohíbe sobrescribir `host`, `x-amz-content-sha256`,
  `x-amz-date`, `authorization`; también nombres repetidos bajo
  diferentes mayúsculas o nombres/valores que incluyan inyección
  por CR/LF/NUL. Ante malformación, se aborta **antes de fetch**.
- `readPrefix` firma
  `host;range;x-amz-content-sha256;x-amz-date` y el hash de
  la CanonicalRequest cambia si el valor de Range cambia.
- Los GET de objeto completo y HEAD sin Range conservan
  `host;x-amz-content-sha256;x-amz-date`. No cambia el alcance
  de las credenciales ni el path/key, ni se agregan permisos.
- Se mantienen B109 límites de streaming y cancelación,
  B90 GET+SHA256 del export privado, y B80/B81 limpieza
  owner-fenced (sin DELETE Object directo).

## Pruebas y aceptación

**Nuevas pruebas B110:**
1. Siete casos nativos Node: Range dentro de los encabezados
   firmados, digest canónico distinto al alterar Range, compatibilidad
   GET/HEAD, protección ante sobrescritura de campos reservados,
   duplicados por casing e inyección por CR/LF/NUL.
2. Dos casos Jest del adaptador: `readPrefix` transmite Range
   firmado, HEAD y GET completo mantienen firma sin Range.
3. Dos escenarios TCP localhost SigV4 con el adaptador real:
   GET con Range validado por B87 y **mutación/eliminación de
   Range rechazada por el verificador independiente**; GET sin Range
   aún válido. El fixture captura headers **solo para el caso de
   test solicitado**, sin credenciales productivas.
4. Inventario obligatorio de **40 escenarios B86–B110**, ejecución
   Node24 y TAP anti-skips B107 intactos, con guard nuevo y
   reconciliación de B104–B109.

Comandos del checkout:

```sh
pnpm test:account-export-b110-signed-range
pnpm test:account-export-b107-release-acceptance
pnpm test:account-lifecycle-contract
```

## Evidencia real obtenida, con límites

En este entorno Node22.16.0 se ejecutaron **7/7 tests nativos PASS**,
sin fallos/skips/TODO. Ambos archivos ejecutados coincidieron con
los hashes de blobs GitHub de la rama:
- Helper `082f305b2483b231979ccc26dfad8795eb08c1de`.
- Tests `83916f854a413532638fca7dce13bf84f03b80d1`.

La suite nativa demuestra la construcción del conjunto de encabezados
firmados y la modificación del hash canónico; los tests TCP que
verifican la firma verdadera del adaptador siguen definidos pero
**no se ejecutaron** aquí.

**Todavía pendientes:** 40 pruebas TCP firmadas reales en
checkout Node24/pnpm9, Jest/Nest, typecheck/lint,
Mongo replica B94, AWS/MinIO IAM/lifecycle, backups,
navegadores y auditorías #133/#141. El GO no puede basarse
únicamente en unit tests ni guards estáticos.

**#353 permanece HOLD**, `STUDY_PROGRESS_ENABLED=false`; sin deploy.
