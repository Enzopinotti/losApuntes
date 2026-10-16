# B91 — Verificación anticipada de integridad antes de transmitir exportaciones privadas

**Base:** B90 `main@b2305ce54f986bc10eba9e2a9632c9b7e0463d3b`.  
**Release:** #353 OPEN/HOLD, `STUDY_PROGRESS_ENABLED=false`, sin CI manual ni despliegue.

## Problema detectado

B90 relee por S3 GET el archivo inmediatamente después de escribirlo y solo publica su referencia si los bytes coinciden en tamaño y SHA-256. El endpoint autenticado `GET /account/exports/:id/download` ya incorpora `verifyAccountExportDownload`, un verificador de integridad **durante** la transmisión. Sin embargo, este último puede descubrir una alteración de igual longitud recién al recibir el último chunk: algunos bytes del documento ya se transmitieron y no pueden retirarse del navegador.

Un objeto modificado, truncado, perdido o inaccesible **después** del readback inicial B90 podía iniciar una respuesta HTTP `200` y un adjunto defectuoso. Además, los errores internos del proveedor podían aflorar tarde a través del stream.

## Corrección B91

`AccountExportArtifactStorage` añade `verifyReadable(jobId, generation, {byteLength,sha256}, signal?)`. Su implementación S3 usa el mismo `verifyAccountExportStoredBytes` de B90 contra la **clave privada exacta** de la generación, leyendo por streaming y rechazando errores, tamaño o SHA-256 diferentes, sin buffering completo.

El controlador ejecuta en el siguiente orden:

1. Autenticación y consulta de propietario mediante `AccountExportService.download`. Estados no encontrados, no listos y expirados mantienen las respuestas 404/409/410; la validación de generación, versión y metadata permanece previa a cualquier acceso al bucket.
2. Prepara un `AbortController` y escucha desconexiones antes de abrir el GET de preflight.
3. **Primera lectura S3:** `await artifacts.verifyReadable(...)`. Si falla, limpia listeners, cancela la lectura y genera un error estable **503 `ACCOUNT_EXPORT_STORAGE_UNAVAILABLE`**, sin preparar headers de adjunto, sin llamar a `reply.send`, y sin exponer claves S3 ni texto de error del proveedor.
4. **Solo si la verificación fue íntegra**, agrega headers privados (`Cache-Control: private, no-store`, `Content-Length`, `nosniff`, nombre v1/v2/v3) y abre una **segunda lectura GET**. La transmisión sigue pasando por `verifyAccountExportDownload`, que detecta alteraciones y cancelaciones ocurridas *después* de la primera lectura.
5. No se agrega ninguna eliminación S3. B78–B85 conservan la autoridad exclusiva de compensación y retención; el endpoint no encola borrados ni cambia la referencia Mongo.

**Límite real:** es una estrategia de *preflight + streaming recheck*, no una instantánea inmutable. Un actor con permisos de escritura sobre la misma clave podría modificar el objeto entre los dos GET; la comprobación del stream detectaría la alteración, aunque ya podría haber enviado bytes. Para eliminar completamente la ventana hace falta inmovilizar objeto/versión o descargar a almacenamiento privado temporal verificado, con revisión de privacidad y cuotas. Es importante no describir el endpoint como capaz de revocar bytes ya transmitidos.

**Costo:** cada intento de descarga válido realiza un GET completo de preflight adicional al GET del adjunto; B90 ya utiliza un GET al generar el archivo. Deben medirse costos, latencia y carga sobre almacenamiento antes del release. Para archivos grandes no se mantiene el contenido en RAM.

## Pruebas incorporadas

- Jest de controlador: el preflight bloquea headers y body hasta terminar; errores de proveedor/corrupción responden 503 genérico sin detalles y limpian listeners; un cliente desconectado aborta preflight; se preserva owner authorization y el digest en transmisión.
- Jest del adaptador: bytes correctos, lectura en partes, corrupción del mismo tamaño, truncamiento y error del backend se resuelven a través del verificador real sin `deleteObject`.
- Suite Node aislada: `scripts/test-account-export-b91-download-preflight.test.mjs` utiliza ambos verificadores de producción en un modelo de doble GET sin dependencias Nest. Cubre preflight sano, corrupción, truncamiento, GET 503, exceso de bytes, cambio de objeto después del primer GET (segunda verificación falla) y metadata inválida. No reemplaza Jest del controlador.
- Guardia estructural: `scripts/test-account-export-b91-preflight-guard.mjs` comprueba orden de autorización, preflight antes de headers, cancelación, error genérico, verificador de stream conservado y cadena de regresión.

**No se declara aprobado** Jest/TypeScript/ESLint/Prettier, Mongo replica-set, S3 proveedor AWS/MinIO, HTTP/browser o IAM/versioning/backup. Sigue faltando aceptación B86–B90 y las auditorías #133/#141. La issue #353 permanece HOLD, feature flag OFF, sin CI manual ni despliegues.

## Carriles de calidad

Las PRs abiertas #403/#405/#407/#408/#399/#404 y otras ramas apiladas modifican pruebas de exportación o configuración. Deben rebasear sobre el `main` actualizado y conservar el preflight B91, su error 503 y la comprobación SHA durante transmisión. No repetir un snapshot en el que solo se verificaba el objeto durante la creación.
