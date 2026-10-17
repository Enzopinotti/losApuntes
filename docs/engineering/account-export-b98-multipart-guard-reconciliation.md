# B98 — Compatibilidad de la aceptación B96 con el lector acotado B97

**Base exacta:** `main@69535a16559a28f00819fe0bbdee6f94bef5454d` (B97).  
**Alcance:** corrección del quality gate de exportaciones, sin cambiar el adaptador S3 productivo, API pública, datos, permisos ni las reglas de cleanup.

## Regresión encontrada en main

B97 reemplazó correctamente `await response.text()` por `readBoundedS3MultipartCompletionXml(response)` antes de validar el XML con B96. Sin embargo, `scripts/test-account-export-b96-guard.mjs` continuaba buscando de forma obligatoria la sentencia eliminada `const xml = await response.text();`.

El guard antiguo calculaba `body = -1` y rechazaba el circuito correcto incluso cuando el XML se validaba antes de `completed = true`. Como `test:account-lifecycle-contract` llama al guard B96 antes del B97, ese falso negativo bloqueaba la cadena.

## Corrección integrada en B98

El guard B96 ahora limita su análisis al cuerpo específico de `complete()` (desde `POST ?uploadId` hasta `abort()`) y exige **en orden**:

1. Comprobar `response.ok`.
2. Leer la respuesta mediante `readBoundedS3MultipartCompletionXml(response)` (B97, 64 KiB, UTF-8 fatal y cancelación).
3. Validar `isConfirmedS3MultipartCompletion(xml)` (B96, rechazo de confirmaciones ambiguas).
4. Recién entonces marcar `completed = true`.

Además rechaza expresamente cualquier reintroducción de `response.text()` dentro de la finalización multipart.

No se relajan ni se retiran los tests de B86–B97. Se conserva `deleteObjectOnAbort: false` en las exportaciones privadas y la limpieza owner-fenced (B80/B81).

## Verificación y límites

Ejecutar desde un checkout actualizado a la rama candidata:

```bash
node scripts/test-account-export-b96-guard.mjs
node scripts/test-account-export-b97-guard.mjs
pnpm test:account-export-b96-multipart
pnpm test:account-export-b97-multipart
pnpm test:account-lifecycle-contract
```

La revisión de fuente sobre blobs GitHub comprueba la ordenación y la ausencia del marcador obsoleto, pero **no** equivale a ejecutar toda la cadena Node/Jest en un checkout local. Mantener como pendiente hasta evidencia de ejecución en Node 24/pnpm 9. Siguen pendientes Mongo replica set, proveedor S3, pruebas HTTP completas, backup/IAM y auditorías de lanzamiento.

**Release #353: HOLD.** `STUDY_PROGRESS_ENABLED=false` en producción. No CI manual ni despliegue.