# B123 — Reparación de fallos compartidos en Jest/Node24

**Base:** `main@e901ce489881328b6d2dc463c54f15b126b1a192` (B122).  
**Release:** issue #353 `OPEN/HOLD`, Study Progress desactivado en producción.

## Diagnóstico reproducido a partir de los logs reales de verify

En el run global `verify #39149391324` fallaron numerosos jobs de
coverage ejecutando tests de API compartidos. Los fallos no fueron por
Node24 ausente ni por instalación general: el lockfile se instaló.

1. **S3 multipart Jest B112**: el test esperaba `SignedHeaders`
   sin `content-type` en UploadPart y CompleteMultipartUpload,
   cuando el adapter firma esas cabeceras correctamente. B121 ya
   confirmó la firma equivalente con TCP SigV4 real. El test ahora
   exige el header firmado y sus valores exactos `application/octet-stream`
   y `application/xml`, sin debilitar firmas.
2. **Módulo v3 export**: el fixture `UsersService` omitía
   `getStudyProgressExportEpoch`, requerido para capturar y
   revalidar el epoch del propietario antes del commit. Se repuso
   la función en el mock con un epoch fijo de prueba; el código
   productivo sigue exigiendo comprobar el mismo epoch antes/después.
3. **Compatibilidad v2**: la suite esperaba rechazar un job v2
   solo porque la Registry montaba contribuyentes de versiones futuras.
   Eso contradecía el contrato de `AccountExportAssembler`, que
   selecciona **el manifiesto exacto de la versión persistida**.
   La prueba ahora confirma que v2 conserva 31 secciones,
   descarta campos desconocidos y estudio v3 de sus bytes.
   La validación productiva de wiring v3 completo no se cambia.
4. **Recuperación de StudyCollections B57**: la implementación
   validaba el aumento de revisión tras Mongo CAS, pero no
   verificaba que el recurso ya no perteneciera a `resourceIds`.
   Un store incompatible podía declarar éxito con una referencia
   aún presente. Se fortaleció el postcondicionado: revisión
   esperada **y** referencia ausente, o `409
   STUDY_COLLECTION_REVISION_CONFLICT`.
   El test existente que simulaba el caso inconsistente ahora
   protege también esta invariante de negocio.

## Qué no se pisó

Los errores TS de `mongo-account-export.store.spec.ts`,
`account-export.controller.spec.ts` y
`study-progress-export.reader.spec.ts` ya pertenecen a los
PR de calidad abiertos #437/#434. B123 no modifica esos archivos
ni sus tests, ni scripts de release, credenciales o flags.

El gate general `pnpm check` además detectó al menos diez archivos
web fuera de formato y varios API. Es un bloqueo separado que este
bloque **no oculta ni saltea**.

## Verificación dirigida

El workflow `.github/workflows/b123-shared-jest-acceptance.yml`
instala pnpm9/Node24 desde el lockfile e inicia el Jest real
de las **cuatro suites** afectadas, sin filtro por nombre de test
y con `--passWithNoTests=false`. Comprueba también Prettier para
los TS afectados y compara el árbol limpio y el SHA exacto antes
y después. Es PR-only, read-only y sin despliegue.

**No declarar GO productivo** por este PASS focalizado.
Los problemas de otros PR de calidad, audit exception vencida
el 2026-10-15 y proveedor S3 real/IAM/backup/browser siguen siendo
condiciones obligatorias de #353.
