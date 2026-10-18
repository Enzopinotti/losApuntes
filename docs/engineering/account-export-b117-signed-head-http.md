# B117 — Aceptación HTTP firmada del HEAD S3 privado

**Base:** `main@76a5b8177d9dd47afda65709fe92924aac2ab22b` (B116).
**Release:** #353 OPEN/HOLD, `STUDY_PROGRESS_ENABLED=false`.
**Sin CI manual ni despliegue.**

## Problema

B116 endureció la confirmación de un objeto S3 por HEAD y el
formato de `Content-Length`. Sus pruebas nativas de contrato y
regresiones Jest no certificaban que la lógica productiva atravesara
correctamente un HEAD real HTTP/1.1 sobre localhost y el verificador
independiente de firma AWS SigV4. Un guard de fuente no equivale a
ejecutar el adapter con sockets reales.

## Nuevo comportamiento de aceptación

El servidor de laboratorio B86/B87 (ya firmado y aislado en
`127.0.0.1:0`) ahora responde también a HEAD **después** de pasar
`verifyB87S3SigV4`, sin otro storage, sin internet y sin cambiar
claves productivas. Permite generar metadatos de respuesta erróneos
mediante `headReply`, exclusivamente en la fixture de pruebas.

Se agregan **4 grupos top-level** con escenarios internos:

1. Escritura privada firmada PUT, HEAD HTTP 200 con longitud,
   Content-Type y ETag válidos, eliminación explícita y HEAD 404.
   Verifica SignedHeaders y secuencia exacta de requests.
2. HTTP 202 Accepted y 206 Partial Content con tamaño plausible
   deben rechazarse, sin borrar ni modificar el objeto privado.
3. HEAD 204 y HEAD 200 sin Content-Length no acreditan metadata.
4. HEAD 200 con `Content-Length` vacío, ceros a la izquierda,
   exponentes, duplicado o fuera de rango no puede publicar éxito.
   El cliente HTTP nativo puede rechazar esas cabeceras en el transporte
   antes de llegar al parser S3: ambos caminos de rechazo son válidos.
   El motivo específico del error se verifica en los tests de contrato B116.

Conserva contrato B116 y tests nativos previos. No cambia `headObject()`
ni las reglas de autorización; los casos hacen ejecutar el **adapter
productivo**, no un simulacro del parser. El conjunto firmado B86–B117
pasa de **53 a 57** grupos distintos, obligatorios en el gate Node24
de B107; TAP debe acreditar todos sin skip, TODO, omisiones ni errores.

Los guards B104–B115 se reconcilian con el inventario vigente
para que ninguno dé por finalizada la batería incompleta, manteniendo
las comprobaciones históricas B104–B116.

## Comandos en checkout Node24/pnpm9

```sh
pnpm test:account-export-b117-signed-head
pnpm test:account-export-b107-release-acceptance
pnpm test:account-lifecycle-contract
```

`test:account-export-b117-signed-head` ejecuta primero el guard
estático y luego la batería completa de 57 grupos firmados.
`test:account-export-b107-release-acceptance` requiere Node24
y aborta ante inventario insuficiente, flags productivos no permitidos,
TAP incompleto o casos que fallen/estén omitidos.
`test:account-export-signed-http-diagnostic-node22` puede usarse
como diagnóstico y **no** como evidencia de release.

## Evidencia y límites

Esta modificación agrega la aceptación automatizada; su mera
existencia o la validación estática de fuentes **no significa que los
57 escenarios hayan sido ejecutados**. Se debe registrar el checkout,
SHA exacto, versión de Node, pnpm, resultado TAP completo y cobertura
sin skips. Tampoco sustituye Jest/Nest, réplica Mongo B94, proveedor
S3 real/MinIO (IAM y lifecycle), backup/restore, pruebas de navegador,
typecheck/lint ni auditorías #133/#141.

No remover el bloqueo de `validateRuntimeEnvironment`, no habilitar
Study Progress, no ejecutar CI manual ni desplegar. **#353 HOLD**.
