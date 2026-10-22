# B103 — Eliminar el ACK vacío legado de S3 multipart

**Base verificada:** `main@cbfb973d6df297df22a9ba663af008eb026f904b` (B102).  
**Release:** issue #353 **OPEN/HOLD**, `STUDY_PROGRESS_ENABLED=false`. Sin CI manual ni despliegue.

## Defecto de producción reproducido

El validador `isConfirmedS3MultipartCompletion` de B99/B102 seguía aceptando
`<CompleteMultipartUploadResult/>` como *éxito* en HTTP 200 a causa de una
excepción explícita creada para el simulador local B86. Eso implica
`writer.completed=true` con **ninguna evidencia de ETag**, aun cuando
el contrato de B99 exige un ETag para respuestas completas.

Otro caso: el campo `<ETag>&#32;</ETag>` superaba el control de texto
bruto (las entidades numéricas XML parecen texto no vacío) y también
producía `etagSeen=true` aunque su valor decodificado fuera solo whitespace.

No se debe aceptar este comportamiento por compatibilidad de tests: el
adaptador es compartido y otros consumidores de S3 pueden confiar en `complete()`.
B90 conserva la lectura SHA-256 antes de publicar exportaciones privadas,
pero esa defensa no reemplaza una confirmación de escritura significativa.

## Corrección productiva

1. `CompleteMultipartUploadResult` autocerrado siempre devuelve **false**.
2. Todo `ETag` debe ser no vacío **después de decodificar** entidades XML
   predefinidas y numéricas permitidas y aplicar `trim()`. Se siguen
   rechazando ETag duplicados, markup/entidades ilegales y XML malformado.
3. El fixture HTTP localhost B86 pasa a responder una finalización
   `CompleteMultipartUploadResult` con `Bucket`, `Key` y `ETag`,
   correspondientes a la solicitud firmada. Así el simulador se ajusta al
   contrato en vez de disminuir la validación del adaptador.
4. La rama de error deja `uploadId` disponible para `abort()` por ID.
   Con `deleteObjectOnAbort:false` las exportaciones privadas nunca
   borran directamente un objeto quizá ya persistido: B80/B81 decide
   la limpieza mediante generación y owner fencing.

## Tests y evidencia

- Suite nueva `scripts/test-account-export-b103-confirmation-etag.test.mjs`:
  ACK autocerrados, ETag vacío codificado como espacios y controles XML,
  resultado AWS positivo, B102 identidad del objeto y B99 integridad sintáctica.
- B96/B99/B102 reajustadas para **rechazar** el ACK legado.
- Jest del adaptador y fixture HTTP SigV4 con prueba de ACK falso aun
  después del commit simulado, abort multipart-ID-only y *no* DELETE Object.
- Guards B96/B99/B102 actualizados; guard B103 nuevo y comandos
  `test:account-export-b103-etag` y `test:account-lifecycle-contract`.

```sh
pnpm test:account-export-b103-etag
pnpm test:account-export-b101-signed-http
pnpm test:account-lifecycle-contract
```

**Red/green observado:** sobre el parser B102 en `main`, los nuevos
tests B103 detectaron dos grupos fallidos (autocierre y `&#32;`).
Contra el parser corregido, los callbacks de B96 (10), B99 (5),
B102 (5) y B103 (5) pasaron **25/25** al ejecutar V8 con las
anotaciones TypeScript eliminadas; los blobs y tests fueron recuperados
de GitHub. La prueba V8 aísla semántica del parser, **no es ejecución**
del runner nativo Node24 ni de Jest/SigV4 completo.

Siguen **pendientes**: Node24/pnpm9 en checkout integral, batería HTTP
firmada B86–B103 (**24 tests declarados**), Nest/Jest/API TypeScript y lint,
Mongo replica B94, IAM y lifecycle S3/MinIO real, backup, navegador y
auditorías #133/#141. No declarar release por esta prueba aislada.
