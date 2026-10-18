# B115 — Integridad de longitud en GET de objetos S3 completos

**Base:** `main@a228183ad557e0b3114d983a06d84e1bf463d672` (B114).  
**Release:** issue #353 OPEN/HOLD, `STUDY_PROGRESS_ENABLED=false` en producción. Sin CI manual ni despliegue.

## Hallazgo real

B114 exige `HTTP 200` para un GET de objeto completo y garantiza que
un `AbortSignal` no pueda interpretarse como EOF satisfactorio. Sin
embargo, `readObjectChunks()` no comprobaba `Content-Length`.
Un proveedor/gateway que respondiera HTTP 200 con un cuerpo más corto
de lo declarado podía provocar EOF natural y que un lector/escaner
tratara el stream como completo, sin validación de longitud a nivel
de este adaptador. B90 mantiene la validación superior de SHA256
de exportaciones privadas, que no se sustituye aquí.

## Corrección

`s3-full-object-length.ts` define dos contratos puros:

- `parseS3FullObjectContentLength()`: cabecera decimal canónica, entero
  seguro no negativo; `null` permite un proveedor S3 compatible que
  use respuesta chunked sin tamaño explícito. Rechaza valores vacíos,
  negativos, infinitos, no canónicos, duplicados y mayores al entero
  seguro máximo.
- `assertS3FullObjectContentLength(expected, received, eof)`:
  antes de emitir partes de cada chunk recibido se rechaza si su
  tamaño llevaría el total por encima del declarado. En el EOF
  **natural** se requiere total exacto; el EOF prematuro es error,
  no finalización de archivo.
- Los metadatos se procesan *dentro* del `try/finally` ya existente
  para cancelar el reader ante metadata inválida o exceso/truncación;
  se mantiene la autoridad de `AbortSignal` B114.
- El cierre voluntario `iterator.return()` del consumidor conserva
  su semántica de cancelación sin simular EOF natural.
- No se añade buffer completo ni se cambian firmas SigV4, permisos,
  rutas, descargas presignadas, B90 SHA256, ni cleanup B80/B81.

**Alcance:** el chequeo ofrece consistencia estructural con
`Content-Length`; un servidor mentiroso que entregue un cuerpo
distinto con la misma longitud exige hashes/readback de B90.
Tampoco es una garantía de memoria total del proceso.

## Pruebas implementadas

- **8 tests nativos** de las dos funciones TS: longitudes enteras,
  cero, ausencia para chunked, invalidación de metadatos, exceso,
  EOF prematuro, finalización exacta y cancelación voluntaria.
- **5 pruebas Jest** del adaptador real: EOF 200 truncado, overflow
  antes de entregar bytes, cabecera inválida con cancelación,
  lectura exacta/chunked y `iterator.return()` con stream abierto.
- **2 escenarios TCP localhost con verificador SigV4 B87**:
  objeto completo cuya cabecera corresponde exactamente al contenido
  y proveedor que anuncia longitud original pero corta un byte.
  La segunda prueba exige rechazo de lectura; con HTTP TCP real,
  Undici podría fallar antes de llegar al EOF con el error
  `terminated`, que también es una respuesta segura.
- Inventario TAP Node24 B107 actualizado de **51 a 53**
  escenarios firmados B86–B115, guards históricos B104–B114
  reconciliados y guard B115 nuevo.

## Evidencia ejecutada

El código del helper TS y su test nativo recuperados de GitHub
se ejecutaron en un V8 aislado con las anotaciones TypeScript
eliminadas, conservando las funciones y los ocho callbacks de
prueba: **8/8 PASS**. Blobs exactos recuperados:
- `s3-full-object-length.ts`: `faa2076cd0fb49c37ac3718b25260565276790fc`.
- `test-account-export-b115-full-get-length.test.mjs`:
  `f4bf458c719c3300e0c9f692160671aef2a6a208`.

La ejecución V8 aislada **no** sustituye Node24 ni la suite real
TCP SigV4 o Jest/Nest. Los 53 escenarios HTTP firmados están
definidos pero siguen pendientes de ejecución verificable.

## Comandos del checkout canónico

```sh
pnpm test:account-export-b115-full-get-length
pnpm test:account-export-b107-release-acceptance
pnpm test:account-lifecycle-contract
```

Siguen pendientes: 53 escenarios TCP en Node24/pnpm9, Jest/Nest,
typecheck/lint, Mongo réplica B94, AWS/MinIO con IAM/lifecycle,
backup/restore, navegador y auditorías #133/#141.

**#353 continúa HOLD**. No habilitar producción ni disparar CI manual.
