# B87 — Verificación independiente de SigV4 en la aceptación S3 por HTTP

**Base:** B86 `main@7ef5f4fcdb4f0213888f1671238d770c513da2b9`.  
**Estado de lanzamiento:** issue #353 abierta/en HOLD, `STUDY_PROGRESS_ENABLED=false`, sin CI manual ni despliegue.

## Defecto de la prueba anterior

B86 introdujo un servidor HTTP real en `127.0.0.1` que recibe los PUT, GET, multipart y DELETE del adaptador S3 de la aplicación. Sin embargo, la simulación únicamente validaba que `Authorization` **empezara** con `AWS4-HMAC-SHA256` y que existiera una fecha con formato AWS. Una petición con una firma falsa, un cuerpo cambiado después de firmar o una clave de objeto distinta podía atravesar el simulador. Esto daba confianza excesiva en un test que se describía como de solicitudes firmadas.

## Corrección B87

Nuevo módulo exclusivo para tests `scripts/testing/b87-s3-sigv4-verifier.mjs`, **independiente del firmador de producción**. Recalcula desde el request recibido:

- Ruta canónica exacta del bucket y clave `exports/<job UUID>/<generation UUID>.json`.
- Query canónica con percent-encoding y orden binario AWS, incluyendo `uploadId`, `partNumber` y `uploads`.
- Host exacto, headers firmados presentes, ordenados y sin duplicados.
- SHA-256 del cuerpo realmente recibido; compara con `x-amz-content-sha256`.
- Scope de credencial, región, servicio `s3`, fecha AWS y tolerancia de reloj de 15 minutos respecto del reloj fijo de fixture.
- Cadena de firma AWS4-HMAC-SHA256 y HMAC derivado por fecha → región → servicio → `aws4_request`.
- Comparación de la firma y hash por `timingSafeEqual`; faltantes o valores malformados devuelven falso sin excepciones.

El servidor local de B86 ejecuta este control **antes de crear, leer o eliminar un objeto simulado**. La autorización inválida retorna HTTP `403 SignatureDoesNotMatch` y no modifica los bytes. Se conservaron los cinco tests originales del adaptador y se sumaron tres regresiones sobre el transporte HTTP real: firma inventada, contenido adulterado **después** de firmar, y solicitud firmada redirigida a otra clave.

## Pruebas ejecutadas

`scripts/test-account-export-b87-sigv4.test.mjs` prueba la función independiente con vectores de solicitudes válidas y adulteradas. **9/9 tests Node ejecutados y PASS** con Node v22.16.0 en copias cuyo Git blob es idéntico a GitHub:

- `scripts/testing/b87-s3-sigv4-verifier.mjs`: `a075ae7a151d3112429ed75d3b155afd5125b7e6`.
- `scripts/test-account-export-b87-sigv4.test.mjs`: `0226d0d285b82af35d44ac795353250d2f1e8f2a`.

Incluye éxito PUT/GET firmado, query multipart y cabecera `content-type`, y rechazo por firma falsificada, cambio de payload, objeto o query, región/clave/secreto, reloj fuera de rango, cabeceras faltantes/duplicadas y fechas inválidas.

Además, `scripts/test-account-export-b87-guard.mjs` comprueba que el loopback verifica criptográficamente **antes** de sus handlers. La cadena `test:account-lifecycle-contract` ejecuta los nuevos tests y sigue ejecutando B86 y sus regresiones previas.

**No ejecutados:** el test B86+B87 completo de loopback TCP usando el adaptador S3 real (no está disponible el checkout completo para Node24), el replica set Mongo opt-in, Jest, TypeScript/lint, un proveedor S3 AWS/MinIO y aceptación navegador/HTTP. Las pruebas de SigV4 locales no prueban IAM real, versionado de objetos, multipart de proveedor, lifecycle/retención ni backup/restore. No hay motivo para levantar #353.

## Reproducción

```bash
pnpm test:account-export-b87-sigv4
pnpm test:account-export-b86-s3-loopback
```

El segundo comando debe ejercitar todos los casos de B86 y B87 con red **solo localhost**. La aceptación Mongo sigue siendo opt-in mediante el runner B86 con URI local aislada. Para la liberación hay que ejecutar todo sobre el SHA exacto de `main` con Node 24/pnpm 9, sumar los ensayos de S3 real, IAM, seguridad #133/#141 y evidencia de recuperabilidad.

## Integración con carriles paralelos

Las PRs de formateo/lint y QA previas (#349, #377, #383, #385, #387, #388, #390, #391, #393, #396, #399) deben rebasear contra el `main` actualizado y conservar los escenarios B86, la verificación B87 y la separación entre simulador S3 y proveedor real. No convertir errores HTTP 403 del test en autorizaciones o avisos sin bloquear.
