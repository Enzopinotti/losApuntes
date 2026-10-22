# B92 — Reautorizar la descarga después del preflight de S3

**Base:** `main@13196580eedd2be8c6728a9ff721eb09ff68141d` (B91).  
**Lanzamiento:** #353 OPEN/HOLD, `STUDY_PROGRESS_ENABLED=false`, sin CI manual ni deploy.

## Problema: permisos y vencimiento congelados durante un GET largo

B91 implementó el preflight íntegro de S3 antes de mandar headers o el cuerpo del `GET /account/exports/:id/download`. Sin embargo, se calculaba la autorización del dueño y el vencimiento **antes** de ese GET. Una exportación grande o un proveedor lento pueden hacer que transcurra tiempo suficiente para que:
- el usuario cierre o pierda acceso a la cuenta;
- el artefacto llegue a su vencimiento de retención y sea retirado;
- el job pase a un estado no descargable;
- cambien la generación, el formato o la metadata `byteLength`/`sha256` con la que se verificó el objeto.

El controlador anterior terminaba el preflight con un snapshot de acceso ya obsoleto y abría el stream de descarga sin consultar otra vez Mongo.

## Implementación B92

Una vez completado el GET de preflight B91, el controlador invoca **otra vez** `AccountExportService.download(request.user.id, id)`, que vuelve a aplicar `assertActiveAccount`, `findOwned`, estado, generación, TTL y metadata. La operación ocurre **antes** de escribir `Content-Type`, `Content-Disposition`, `Content-Length` o `reply.send`.

Nuevo helper puro `reauthorizeAccountExportDownload(before,after)` rechaza todo cambio entre el artefacto verificado y el artefacto todavía publicado: **generación, versión v1/v2/v3, longitud y SHA-256**. No expone la generación en ningún error.

Las respuestas tienen semántica clara:
- Desapareció o quedó ajeno: **404**, igual que el contrato actual.
- Dejó de estar listo: **409 `ACCOUNT_EXPORT_NOT_READY`**.
- Expiró/retirada: **410 `ACCOUNT_EXPORT_EXPIRED`**.
- Sigue disponible, pero cambió su metadata/generación: **409 `ACCOUNT_EXPORT_CHANGED_DURING_VERIFICATION`**; el cliente puede actualizar el estado y repetir la descarga.
- Si se cerró la cuenta, se propaga la excepción de autorización del servicio sin convertirla en un error de almacenamiento.
- Si se cerró la conexión durante la revalidación, no se inicia ningún stream; se limpian listeners y se cancela la operación.

B91 conserva su 503 genérico ante errores de S3 antes de headers. El verificador SHA durante el segundo GET también permanece.

**Ventana residual:** esta segunda lectura de Mongo no crea una transacción que incluya todo el HTTP stream. Puede cambiar la cuenta o el objeto *después* del recheck y antes de que el GET concluya. Proteger por completo esa ventana exige una sesión/pin de generación respaldado por el almacenamiento, bloqueo de borrado durante descarga, u objeto/versionado inmutable con política IAM; no se afirma que B92 resuelva ese problema.

## Pruebas

- Nuevas pruebas Jest del controlador: revocación por 404, 409 y 410 después del preflight; cambios de generación, hash, tamaño y versión devuelven 409 antes de headers; cierre de cuenta propaga 403; una desconexión durante la revalidación bloquea la descarga. Las fixtures previas de éxito se actualizan para representar **dos consultas durables**.
- Suite ejecutable sin Nest: `scripts/test-account-export-b92-reauthorization.test.mjs` con nueve vectores para el helper de snapshot. 
- `scripts/test-account-export-b92-guard.mjs` asegura mediante contrato de fuente el orden de autorización → GET S3 verificado → **reconsulta durable** → headers → streaming con SHA, además de cobertura y HOLD.
- Ambos se agregan al root `test:account-lifecycle-contract`, conservando B90/B91.

## Pendientes antes del release

La comprobación de estados en Node y guardia de fuente **no sustituye** pruebas Jest de controlador con Nest, un HTTP Fastify real, réplica MongoDB, proveedores S3 AWS/MinIO, reglas IAM, retención/versionado, backup, rendimiento de GET redundante ni auditorías #133/#141. Debe ejecutarse el entorno completo Node24/pnpm9 antes de dar aprobación al release #353.

En particular, **no habilitar `STUDY_PROGRESS_ENABLED`**, no hacer deploy ni disparar CI manualmente. Las PRs de calidad apiladas #403/#405/#407/#404/#399/#408, etc. deben rebasear sobre el nuevo `main` y conservar la nueva reautorización y las fixtures de doble llamada.
