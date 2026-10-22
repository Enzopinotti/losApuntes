# B112 — Unificar las cabeceras firmadas de S3 multipart

**Base verificada:** `main@30b54e8e39b92e942856e421fed43a6bb11c3f8e` (B111).  
**Release:** issue #353 OPEN/HOLD, `STUDY_PROGRESS_ENABLED=false` en producción. Sin CI manual ni despliegue.

## Defecto de firma hallado

B110 reforzó el signer de `HEAD/GET/DELETE` (sin cuerpo) con
`collectS3SignedRequestHeaders()`: no se pueden reemplazar
`host`, `x-amz-content-sha256`, `x-amz-date` ni
`authorization`. Pero `signedBodyRequest()`, que firma los
`POST/PUT/DELETE` de los uploads multipart, todavía montaba
los headers con un `new Map([...cabeceras obligatorias,
...input.headers])`. Los encabezados adicionales sobreescribían
las entradas reservadas al normalizar sus nombres a minúsculas.
Además, `normalizeHeaderValue()` convertía CR/LF de valores
opacos en espacios **sin rechazar ese contenido inseguro**.

Actualmente el llamador de producción pasa solamente la clave
`content-type` al inicio del multipart; sin embargo, el valor
puede proceder de datos de entrada y esa divergencia crea un punto
de falla y un riesgo de regresión ante nuevas cabeceras.

## Corrección productiva

`signedBodyRequest()` utiliza ahora el **mismo**
`collectS3SignedRequestHeaders(endpoint.host, payloadHash, amzDate,
input.headers)` que las peticiones de lectura:

- El hash SHA256 firmado deriva siempre del cuerpo, no de un
  encabezado entrante que intente reemplazarlo.
- Se rechazan duplicados diferenciados solo por mayúsculas,
  encabezados reservados y nombres o valores con CR/LF/NUL.
- El `content-type` permitido se normaliza igual en el
  CanonicalRequest SigV4 y en el request transmitido.
- Los uploads válidos conservan el mismo conjunto de
  `SignedHeaders` y los valores ya normalizados.
- No se cambian los métodos HTTP, rutas de objeto, parámetros
  de multipart, IAM ni permisos. Se preservan las defensas
  B80/B81, B90, B104–B111 y los aborts owner-fenced.

## Evidencia red/green y pruebas

Se extrajo el bloque exacto de construcción de cabeceras de
`signedBodyRequest` desde los blobs del adaptador B111
`1d856660bdc44bdc3c4cd830771d561e99473e76` y B112
`a2ae169650a3cd25bff80ef6ce2790c2235852f9`.
El bloque anterior aceptó cinco sobreescrituras o valores
inseguros (`host`, `x-amz-date`, hash, `authorization`,
content-type con CRLF); el nuevo las rechazó. Un
`content-type: application/json; charset=utf-8` legítimo
produjo el **mismo mapa firmado** antes y después. Es
comparación ejecutable aislada de las rutas reales de headers;
no se reprodujo un ataque contra un servidor S3 real.

Se incorporaron:

- **8 pruebas nativas `node:test`** del helper de headers
  utilizado en producción: digest real, POST/PUT, sobrescritura
  de metadatos, casing, CRLF/NUL, nombres inválidos y
  compatibilidad de `content-type`.
- **Tests Jest del adaptador** para la iniciación inválida sin
  llamadas de red y un multipart normal que firma POST,
  parte PUT y finalización POST.
- **2 escenarios TCP localhost con verificador SigV4 B87
  independiente**: reject antes de red de valores CRLF/NUL
  y un multipart firmado positivo con Content-Type
  normalizado. Inventario obligatorio de **44 grupos
  B86–B112**, sin skips y con Node24 exigido por B107.
- Guard B112, actualización de inventarios de los guards
  anteriores, documentación, comando propio y lifecycle.

### Ejecución real en este entorno

Con Node **22.16.0**:
`node --experimental-strip-types --test` sobre los
dos archivos exactos de GitHub produjo **8/8 PASS**,
sin fail/skip/TODO.

`git hash-object` cotejado:
- Helper TS: `082f305b2483b231979ccc26dfad8795eb08c1de`.
- Tests B112: `2b27446e94e5b1d724d15e3ccc76b6aea62b10b5`.

```sh
pnpm test:account-export-b112-signed-body-headers
pnpm test:account-export-b107-release-acceptance
pnpm test:account-lifecycle-contract
```

## Bloqueo de liberación

**No se ejecutó** la suite completa de **44 casos TCP SigV4**
con adaptador real en Node24/pnpm9, Jest/Nest, lint/typecheck,
Mongo replica B94, AWS/MinIO IAM/lifecycle, backup/restore,
navegadores y auditorías #133/#141. Los tests unitarios,
la comparación de bloques y los guards de fuente
**no constituyen GO**.

**#353 sigue OPEN/HOLD.** No ejecutar CI manual ni desplegar.
