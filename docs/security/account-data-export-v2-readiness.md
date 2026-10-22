# Bloque B45 — Exportación de cuenta versionada (v1 intacta, v2 preparada)

**Estado de activación:** código versionado, pero **nuevas solicitudes siguen en v1**. 
**Motivo:** preparar el desbloqueo de las Colecciones persistentes del PR #316 sin generar exportaciones incompletas.

## Hallazgo que originó el bloque

La exportación general del usuario usa un trabajo durable (`account_export_jobs`) y un inventario fijo de **30 secciones** para `los-apuntes-account-export` versión **1**. Su worker antes ignoraba `job.formatVersion` y siempre emitía un v1. Si se activara directamente `study_collections` sin un nuevo contrato, esos datos quedarían fuera de la exportación, aunque una respuesta HTTP 200 sugiriera completitud.

## Política implementada

| Propiedad | Export v1 existente | Futuro export v2 |
| --- | --- | --- |
| Formato externo | `los-apuntes-account-export` | Igual |
| `version` JSON | 1 | 2 |
| Apartados obligatorios | 30, manifest histórico inmutable | 31: los 30 anteriores más `study.collections` |
| Solicitudes nuevas | **Siguen en v1** | **No habilitadas** |
| Trabajos preexistentes | Se procesan con su versión 1 sin migrar | Se procesarán con 2 cuando exista todo el cableado |
| Inventario incompleto | Rechazo fail-closed | Rechazo fail-closed |
| Archivo a descargar | `los-apuntes-account-export-v1.json` | `los-apuntes-account-export-v2.json` |

Las declaraciones `ACCOUNT_EXPORT_V1_SECTION_IDS` y `ACCOUNT_EXPORT_V2_SECTION_IDS` son inventarios explícitos. `accountExportSectionIds` rechaza versiones desconocidas.

`AccountExportAssembler` conserva `writeJsonV1` (compatibilidad de llamadas y tests), añade `writeJsonV2`, y sólo incluye las secciones de la versión persistida en el job. Aun con 31 proveedores montados en el futuro, un job v1 conserva **exactamente 30 secciones**. V2 exige además que el inventario completo montado sea exactamente el de 31 apartados: jamás publica una exportación parcial si falta `study.collections` o aparece un apartado no autorizado.

`AccountExportProcessor` despacha en función de `job.formatVersion`, no del default actual. Las versiones desconocidas fallan antes de generar artefactos.

`AccountExportService.complete`, `.status` y `.download` validan `artifactSectionCount` **contra la versión del trabajo**; 30 no es aceptable para un job v2, ni 31 para uno v1. Se conserva la verificación de SHA-256, tamaño, generación, vencimiento, cuenta activa y owner. El controlador nombra el archivo según la versión interna del artefacto y rechaza versiones inesperadas sin leer S3.

## Lo que NO hace este bloque

- **No incrementa** `ACCOUNT_EXPORT_FORMAT_VERSION`: sigue siendo `1`.
- **No añade** el proveedor `study.collections` a `DataLifecycleModule` porque el dominio del PR #316 aún no se fusionó, no tiene una proyección de cuenta aprobada y necesita lifecycle/retención.
- **No modifica** el set de 30 secciones del contrato público v1 ni reescribe trabajos/artículos emitidos.
- **No activa** nuevas escrituras en `study_collections`, ni declara borrado físico como consecuencia del cierre de cuenta.
- No es una migración de cuentas, artefactos, jobs o buckets.

## Contrato previsto de `study.collections` (B46)

Proyección de lectura owner-only, paginada con cursor opaco y límite máximo 100, con id estable, título, descripción propia, IDs opacos de recursos, revisión y fechas de creación/actualización. Sin metadatos de recursos de terceros ni URLs firmadas; la exportación no concede acceso a recursos referenciados ni los expande. El contributor debe consumir una consulta del dominio Study Collections y **no** consultar Mongo ajeno desde DataLifecycle.

## Requisitos antes de elevar default a 2 / fusionar #316

1. Rebase de #316 sobre `main`, resolver sus conflictos de rutas y navegación tras B40–B44.
2. Implementar en Study Collections una lectura de exportación bounded, owner-only, con proyección allowlisted y cursor estable, índices y pruebas multi-cuenta.
3. Registrar `StudyCollectionsModule` y su contributor en `DataLifecycleModule` y cambiar la validación del *cableado real* de v1 a v2 completo. Mantener `writeJsonV1` para claims históricos.
4. Documentar `COL-FR-001..006` en documento funcional canónico y la sección v2 del contrato de exportación, incluyendo retención/offboarding.
5. Asegurar que una solicitud nueva nunca reciba un v1 **una vez que existan colecciones privadas persistentes**. Hasta el corte, el backend no debe habilitar la escritura de colecciones.
6. Ejecutar Jest (incluyendo regresiones 30/31, retries y artefactos antiguos), typecheck, build, smoke contra Mongo y S3, test de descarga, fallos de red, vencimientos y auditoría de dependencias sobre SHA exacto.

**Actualización B46:** el lector owner-only y el contribuyente `study.collections` ya están implementados y montados mediante `StudyCollectionsExportReadModule`. La fábrica de exportación está protegida por un manifiesto de 31 secciones y las exportaciones v1 conservan su conjunto histórico de 30. **La nueva solicitud de cuenta sigue en v1**, mientras que el PR #316 todavía no habilita CRUD en `main`; falta el corte atómico entre persistencia y v2 más el contrato de cierre/retención. Véase `docs/security/account-data-export-v2-study-collections.md`.

**Un merge de B45/B46 acredita integración del código, no activación de v2 para nuevas solicitudes ni aceptación de producción.**
