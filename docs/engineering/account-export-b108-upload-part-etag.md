# B108 — UploadPart ETag estricto y acotado antes de confirmar S3 multipart

**Base exacta:** `main@f4515a44552993547d48e07a4b5ea91b6efd845e` (B107).  
**Release:** #353 OPEN/HOLD; `STUDY_PROGRESS_ENABLED=false` productivo. Sin CI manual ni despliegue.

## Defecto identificado

El adaptador compartido `createMultipartWriter` B107 normalizaba
cada header de UploadPart mediante:

```ts
const rawEtag = response.headers.get('etag')?.trim();
const etag = rawEtag?.replace(/^"|"$/gu, '');
```

La expresión suprime una comilla inicial **o** una final sin verificar
que estén equilibradas. Por ejemplo, `"part-unclosed` se convertía
en `part-unclosed`, era aceptado como ETag y pasaba a
`CompleteMultipartUpload`. Tampoco existía un límite de tamaño para
este header, por lo que miles de partes podían generar XML de
confirmación desproporcionado desde headers arbitrarios.

**No se acepta un HTTP 200 como ETag válido** sin comprobaciones:
es posible que un proxy o proveedor S3 compatible responda
con metadata corrupta, incluso con cuerpo de parte ya persistido.

## Funcionalidad incorporada

Módulo nuevo y testeable
`apps/api/src/files/storage/s3-multipart-part-etag.ts`:
`normalizeS3MultipartPartEtag(raw)` devuelve el token seguro o
`null`.

- Límite de **256 caracteres** de header bruto (incluyendo comillas y
  espacios exteriores).
- El valor entrecomillado exige **ambas** comillas exteriores. También
  se conserva compatibilidad con proveedores que devuelven un token
  opaco **sin comillas**, como permitía la implementación anterior.
- Rechaza valor vacío, whitespace interior, controles, DEL,
  UTF-8/no ASCII, comillas interiores y barras invertidas.
  No se cambian los tokens simples imprimibles existentes.
- El token se incorpora al XML mediante **la función de escape
  existente** (`xmlEscape`); por ejemplo `opaque&value`
  continúa representándose como `"opaque&amp;value"`.
- Un ETag inválido provoca el mismo error:
  `S3 multipart part returned an invalid ETag`. B104 marca la
  generación como fallida, bloqueando `complete()`; B105
  serializa `abort()` y B80/B81 preservan
  `deleteObjectOnAbort:false` para exportaciones privadas.

Los checksums de bytes B90 siguen siendo obligatorios para publicar
archivos exportados. Esta validación es de **formato y memoria**,
no demostración criptográfica de integridad de cada parte.

## Pruebas nuevas y regresiones

1. **5 tests nativos Node22** para headers citados/sin citar,
   comillas incompletas o embebidas, controles/tabulaciones,
   whitespace, Unicode, límites exactos y tokens opacos
   compatibles con XML.
2. Casos Jest del adaptador para ETags malformados tras HTTP 200:
   sin `POST Complete`, con `DELETE ?uploadId=` únicamente
   después de aborto. Caso positivo para `opaque&compatible`.
3. Dos escenarios TCP firmados localhost (B87 SigV4): ETag de
   parte inválido (tres subcasos) y ETag opaco válido.
4. Inventario de aceptación B86–B108 ampliado de 34 a **36
   escenarios top-level**, con requisito Node24 y TAP estricto B107.
   Los guards históricos B104–B107 se reconcilian sin reducir
   las reglas de rechazo.

## Evidencia ejecutada

En el contenedor disponible se materializaron solamente los dos
archivos fuente necesarios para la unidad B108. Ambos se cotejaron
contra sus **Git blob SHA exactos**:
- Parser `8cda67a10135941442e8d1e6e50076f9500f7269`.
- Test `e04f8bf81aca706f29dd92e4ba3acb0f1078ab5f`.

`node --experimental-strip-types --test` sobre **Node22.16.0**:
**5/5 PASS**, 0 errores, skips y TODO. Son tests reales de la
función productiva TypeScript, no ejecuciones S3 con red real.

**No ejecutado** aquí: 36 tests TCP firmados en checkout canónico
Node24/pnpm9, Jest Nest, typecheck/lint, Mongo replica B94,
S3/MinIO remoto IAM/lifecycle, backup/restore, navegadores o
auditorías #133/#141.

Comandos en el checkout canónico:

```bash
pnpm test:account-export-b108-part-etag
pnpm test:account-export-b107-release-acceptance
pnpm test:account-lifecycle-contract
```

**#353 sigue OPEN/HOLD**, sin CI manual ni despliegue.
