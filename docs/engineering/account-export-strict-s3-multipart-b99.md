# B99 — Validación estructural estricta de S3 CompleteMultipartUpload

**Base:** B98 main@43a24cf4b03f9aacffa2b7fca3afce2090d98476.  
**Release:** issue #353 OPEN/HOLD, producción con STUDY_PROGRESS_ENABLED=false. No CI manual ni deploy.

## Brecha concreta

B96 rechazaba respuestas S3 HTTP 200 vacías, errores embebidos y un envelope exterior incorrecto. Sin embargo, una respuesta con raíz CompleteMultipartUploadResult correctamente abierta/cerrada podía contener hijos incompatibles, ETag ausente, etiquetas de campo mal anidadas o entidades XML ilegales. El helper anterior autorizaba esa estructura porque buscaba solo delimitadores exteriores por regex.

## Cambio productivo

El helper ya usado por el S3 writer verifica ahora un subconjunto **deliberadamente acotado** del resultado AWS S3. Para mensajes XML no-autocerrados exige:

- Una única raíz CompleteMultipartUploadResult, con declaración XML opcional y xmlns por defecto opcional.
- Campos hijos planos, únicos, cerrados y reconocidos: Location, Bucket, Key, ETag y checksums conocidos.
- ETag obligatorio, no vacío. No acepta ETag duplicados ni anidados.
- Cadenas XML con entidades predefinidas o referencias numéricas válidas; nunca expande entidades externas.
- Prohibición de CDATA, DTD, comentarios, PI internos, atributos arbitrarios, jerarquías inesperadas o cuerpos extra al final.
- Límite existente B97 de 64 KiB de **bytes de red** antes de analizar XML; B99 no sustituye ese límite.

Se conserva de forma **explícita y solo por compatibilidad con el fixture histórico B86** la forma autocerrada <CompleteMultipartUploadResult/> como un ACK válido del simulador local. No es una nueva garantía de que un proveedor externo haya confirmado el objeto. Para AWS/MinIO reales exigir conformance con respuestas completas y ETag en aceptación antes de producción.

Esta validación estricta puede rechazar extensiones de XML propias de proveedores no incluidos en el contrato. No ampliar la allowlist sin un caso documentado y pruebas de proveedor. Evitar decodificación de entidades no necesaria para decidir publicación.

## Orden de controles preservado

1. HTTP 2xx.
2. Lectura incremental acotada y UTF-8 fatal B97.
3. XML estructural B99 sobre el envelope semántico B96.
4. Confirmación local del writer, pero no publicación del artefacto de cuenta.
5. Lectura S3 GET completa con tamaño y SHA-256 B90 antes de publicar en Mongo.
6. Verificación de descarga B91–B93.

Una respuesta de proveedor ambigua conserva uploadId para abort multipart. Las exportaciones privadas mantienen deleteObjectOnAbort:false: nunca emitir DELETE Object directo sobre una generación que podría haberse publicado. El worker durable owner-fenced B80/B81 decide limpieza. El ETag del ACK no reemplaza SHA-256 de bytes almacenados.

## Evidencia y ejecución

Suite standalone B99 (5 casos agrupados con vectores negativos), guard de fuentes B99, regresiones Jest del adaptador y dos casos sobre S3 firmado en HTTP localhost se agregaron al lifecycle:

\`\`\`bash
pnpm test:account-export-b99-xml
pnpm test:account-export-b86-s3-loopback
pnpm test:account-lifecycle-contract
\`\`\`

Se ejecutaron localmente con Node 22 los cinco casos puros B99 sobre los bytes exactos del helper y test de GitHub. La suite completa Node24/pnpm9, guard B99, los tests Jest y el HTTP SigV4 aún requieren correr en un checkout del repo; no declararlos PASS a partir de revisión estática. Mongo replica B94 y storage proveedor real, IAM, lifecycle, backup/restore, navegador y auditorías #133/#141 siguen pendientes.

**No promover el estado de producción fuera de HOLD.**


## Vigencia tras B103

La excepción histórica que aceptaba `<CompleteMultipartUploadResult/>` para el
fixture B86 **fue retirada en B103**. La confirmación requiere ETag real no
vacío incluso si el cuerpo HTTP tiene estado 200. El fixture B86 se corrigió;
consultar `account-export-b103-confirmed-s3-etag.md`. El resto de este documento
registra la decisión histórica de B99, no la política de aceptación vigente.
