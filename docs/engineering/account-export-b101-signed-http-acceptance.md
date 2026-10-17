# B101 — Aceptación S3 HTTP SigV4 local, resolutor Node y evidencia anti-skips

**Base verificada:** main@48b65365d6edca2020339a36a00936423f4a7474 (B100).  
**Producción:** issue #353 OPEN/HOLD, STUDY_PROGRESS_ENABLED=false. No CI manual ni deploy.

## Falla reproducida

El comando B86/B95 tenía `node --experimental-strip-types --test` y cargaba
`s3-object-storage.ts`. El código real de Nest utiliza imports TypeScript
sin extensión (por ejemplo `./s3-multipart-completion`), que Node 22 no
resuelve solo con strip-types. En una reproducción aislada aparecía
`ERR_MODULE_NOT_FOUND`. El hecho de que el test existiera en el repo
**no demostraba que su S3 firmado se hubiera ejecutado exitosamente**.

También estaban obsoletos dos guards: B100 buscaba la llamada antigua
`parseConfirmedS3MultipartUploadId(xml)` cuando B100 la cambió a
`(xml, { bucket, objectKey })`; el guard B86 todavía buscaba checks
`parsed.protocol` en el runner, aunque esos checks se movieron al validador
B89 y la prueba exigible de cinco casos al plan B94.

## Cambios

- `scripts/testing/register-api-typescript.mjs` y
  `resolve-api-typescript.mjs`: registro nativo Node ESM mediante
  `node:module.register` que añade `.ts` **solo** a imports relativos
  sin extensión, cuyo módulo origen y archivo destino están dentro de
  `apps/api/src/` y cuyo archivo realmente existe. Imports `node:`,
  paquetes, extensiones explícitas, URLs y rutas fuera del árbol siguen
  con el resolver estándar. No se cambia el código de producción.
- Root lifecycle y comandos B86/B95 cargan el resolver de test, preservando
  el uso del adaptador real y el verificador independiente SigV4 B87.
- Dos casos HTTP firmados B101:
  1. respuesta CreateMultipartUpload con bucket/key correctos, GET real
     firmado y SHA-256 comprobado antes de considerar los bytes válidos;
  2. rechazo de XML de inicio apuntando a otra key **antes de PUT de partes**
     y sin DELETE Object directo.
- Runner explícito `run-account-export-b101-signed-http.mjs`: ejecuta
  todo el inventario local (22 tests con B101), compara TAP con nombres
  fuente y exige exactamente todos los resultados PASS, cero skip/fail/todo,
  y exit code 0; no basta un éxito del proceso sin cobertura.
- Se actualizan B86/B100 guards para verificar implementaciones actuales
  conservando las salvaguardas B89 URI loopback y B94 cinco casos Mongo.
- Suite unitaria de loader y TAP con vectores positivos/negativos,
  más guard de integración B101.

## Comandos en checkout canónico

```sh
pnpm test:account-export-b101-signed-http
pnpm test:account-export-b86-s3-loopback
pnpm test:account-export-b95-http-integrity
pnpm test:account-lifecycle-contract
```

**Node 24** es requisito para aceptar release. Node 22 puede usarse para
diagnóstico sin promover el estado de aceptación. El test runner usa
exclusivamente un servidor HTTP efímero `127.0.0.1` con credenciales
ficticias y firma SigV4 verificada por un módulo independiente; nunca un
endpoint productivo.

## Evidencia y límites

La falla de import extensionless y su corrección con `register()`
se reprodujeron con un fixture TypeScript mínimo bajo Node 22:
importación sin resolver falla; importación con loader 1/1 PASS.
La batería firmada **completa de 22 tests sobre el checkout canónico**
requiere ejecutarse donde estén disponibles todos los archivos del repo y
Node 24/pnpm9. No certificar ejecución sobre S3 real ni sobre
Mongo replica, IAM, backups, navegador, reten­ción y auditorías. El TAP
anti-skips evita declarar completitud si faltan o se omiten casos.

B90 readback SHA, B91–B93 owner, B96–B100 XML y B80/B81 limpieza durable
siguen vigentes. B101 no habilita flags productivos y no levanta HOLD.
