# B71 — Recuperación de commit S3 ambiguo y aceptación contractual ejecutada

**Proyecto:** Los Apuntes — exportación privada de cuenta.  
**Baseline:** `main@5f74ed5cdf1354aad699405f52cd749d060359d2` (B70).  
**Gate:** issue #353 abierta; `STUDY_PROGRESS_ENABLED` sigue prohibido en producción.

## Defecto confirmado en B70

`AccountExportProcessor.processClaim` sólo programaba compensación para un artefacto cuyo ensamblador había retornado correctamente (`artifactCommitted === true`), salvo algunos errores terminales previos al `complete`. Esa suposición falla cuando `writer.complete()` en S3 *puede haber creado el objeto* pero el cliente pierde la confirmación: `sink.commit()` rechaza, el ensamblador hace `abort()`, el procesador mantiene `artifactCommitted=false` y la transición CAS de Mongo reprograma el intento **sin borrar ni encolar** la generación S3 que podría existir.

Un `abort()` de multipart upload no equivale a borrar un objeto final ya publicado y no prueba ausencia. La lifecycle rule privada seguía siendo el último respaldo, pero se perdía la compensación durable inmediata B69.

## Corrección B71

- Cuando la ejecución del ensamblador falla sin confirmación de artefacto, el procesador sigue intentando `sink.abort()` de manera best-effort.
- Ante un **`reschedule` CAS exitoso**, se ejecuta `deleteOrEnqueueProvenOrphan(job,claimId)` **independientemente de `artifactCommitted`**. En este punto el job ya no puede publicar esa generación de intento: `claimId` se limpia y el siguiente claim usa un UUID nuevo.
- `deleteOrEnqueueProvenOrphan` conserva la garantía de B69: persistir intención de limpieza en Mongo **antes** de DELETE S3; si falla S3, otro worker puede reintentar; si S3 confirma, cancelar sólo la tarea `pending` que ningún worker haya reclamado.
- Si el CAS retorna `false` o arroja error, **no** se borra ni encola. Una pérdida de respuesta de Mongo `complete()` sigue tratándose con la reconciliación exacta B66 (usuario, generación, versión, sección, byte count y SHA-256), sin suponer que la exportación no está referenciada.
- Si el worker perdió su lease **antes de intentar `complete()`**, puede limpiar solamente su propia generación, que nunca intentó publicar en Mongo. Si ya intentó `complete()`, debe preservarla porque el resultado puede ser ambiguo.
- La limpieza tras un CAS válido puede enviar un DELETE sobre una generación que nunca llegó a crearse (por un fallo previo al upload). Esto es deliberado: el DELETE exacto e idempotente de S3 es preferible a filtrar un objeto potencialmente publicado según un estado volátil. No se usa listado de bucket ni DELETE por prefijos.

## Evidencia aportada

**Jest del procesador:** 6 escenarios nuevos (ACK S3 perdido, cola durable + S3 indisponible, CAS perdido, CAS que arroja error, `abort()` fallido y completion v3 correcto sin limpieza). Los tests comprueban orden `reschedule CAS → enqueue Mongo → DELETE S3`.

**Jest del storage:** prueba en `account-export-artifact-storage.spec.ts` que `writer.complete` puede arrojar error, `sink.abort()` no hace DELETE del objeto final, y que el borrado por clave es una operación separada de la interfaz.

**Mongo opt-in:** una exportación v1 con claim real vigente ejecuta `reschedule` sobre Mongo local luego de un error ambiguo del commit S3, persiste la tarea B69 y falla el primer DELETE; un nuevo worker reclama la tarea, borra el objeto exacto y hace ACK, sin crear una exportación `completed`.

**Aceptación:** `scripts/test-account-export-b71-ambiguous-s3.mjs` anexado a `test:account-lifecycle-contract` y runner B70 ampliado para incluir `account-export-assembler.spec.ts` y `account-export-artifact-storage.spec.ts`.

## Comprobaciones efectivamente realizadas en este carril

Se cargaron los blobs exactos de los scripts B67–B71 y sus dependencias en un **ejecutor JavaScript aislado en memoria**, sustituyendo únicamente imports de Node, acceso al filesystem y API de asserts. Se ejecutaron realmente las expresiones y aserciones de los scripts sobre el código de la rama; **no** se ejecutó Jest ni se lanzó Node sobre un checkout.

Resultado: B67 **12/12**, B68 **10/10**, B69 **10/10**, B70 **11/11**, B71 **9/9**: **52 aserciones contractuales aprobadas**. Se encontró y corrigió un defecto real del contrato B69: su regex Unicode usaba una llave literal de cierre sin escapar, provocando error de sintaxis. Luego se ajustó otra aserción B69 que buscaba una forma de código removida por B71, manteniendo el guard `uncertainCompletion && completedAssembly`.

Limitación: Node del contenedor = 22, sin pnpm ni checkout completo; no existe un replica set Mongo accesible ni S3 real. Por lo tanto, **TypeScript, Jest, integración Mongo, proveedor S3 y HTTP siguen NOT_RUN** en esta conversación. Los tests fueron incorporados y la ejecución de contratos estructurales no los reemplaza.

## Criterios pendientes de release

- En un checkout limpio al SHA exacto mergeado de B71, con Node 24 y pnpm 9.15.9, ejecutar `pnpm accept:account-export:b70 --expected-sha <SHA>` con Mongo replica set **local, aislado y sin credenciales**. Capturar el JSON de evidencia del runner.
- Ejercitar un bucket S3-compatible privado que permita inyectar error de ACK en `completeMultipartUpload`, fallo de DELETE, reintento, caída y continuación del worker.
- Validar descarga HTTP con digest SHA-256, privacidad por propietario, retención/versionado, fallas temporales de Mongo y backups/restore.
- Mantener #353 OPEN, el flag productivo OFF, sin waivers de supply chain. Conciliar PR #349 (formato API) y #331 (tests legacy v1) sin revertir el cleanup post-CAS ni el contract B69 reparado.
