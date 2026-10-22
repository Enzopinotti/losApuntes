# B46 — `study.collections` export v2 owner-only

**Estado:** adaptación de lectura y wiring v2 implementados en código. La exportación pública nueva continúa en v1; los endpoints de Colecciones persistentes del PR #316 siguen sin habilitar.

## Alcance real

La rama B46 incorpora el esquema `study_collections` original del PR #316 para compartir índices y definición del registro Mongo, pero **no** importa su controlador, su servicio CRUD ni la ruta de creación. `StudyCollectionsExportReadModule` expone solamente `StudyCollectionExportReader`; importarlo en `DataLifecycleModule` no habilita escrituras nuevas.

El `StudyCollectionsExportContributor` entrega el apartado `study.collections` al Registro de Account Export v2. La fábrica real exige exactamente 31 secciones (las 30 de v1 y esta adicional) y rechaza faltantes, extras y repetidos. Las solicitudes nuevas mantienen `ACCOUNT_EXPORT_FORMAT_VERSION=1` hasta que se integren en un mismo corte los endpoints de Colecciones, la estrategia de retención/cierre y la decisión explícita de exportación v2.

Una tarea v1 anterior sigue serializándose **con exactamente 30 secciones**, aunque el registro actual tenga 31 proveedores. Una tarea durable con versión 2 puede procesar las 31, pero no existe endpoint público para crear una tarea 2 en esta fase.

## Lectura segura del dominio

`StudyCollectionExportReader.listAccountExportCollections(ownerUserId, {limit,cursor})` implementa:

- Exigencia de un dueño no vacío y límite de página entre **1 y 100**.
- Consulta Mongo **`{ownerUserId, id: {$gt: lastId}}`**, cursor ligado al mismo dueño, versión de cursor 1, JSON de estructura exacta, límites de tamaño y codificación base64url canónica.
- Orden estable `id ASC` mediante índice `{ ownerUserId:1, id:1 }`; consulta de `limit+1` para detectar más páginas sin saltos ni duplicados.
- `select` allowlist: `id`, `title`, `description`, `resourceIds`, `revision`, `createdAt`, `updatedAt`. Se excluyen `_id`, `ownerUserId`, `operationKey`, cualquier token de operación y atributos internos.
- Proyección validada de UUIDv4, tamaño de título y descripción, referencias únicas (máximo 100), revisión válida y fechas convertidas a ISO 8601.
- Punteros a recursos como **UUIDs opacos**. No se cargan autores, contenido, archivos ni URLs firmadas. Un ID de recurso en una colección **no concede acceso** a él.
- Errores de Mongo, proyección o cursores manipulados interrumpen la exportación. Nunca se convierte una falla en una sección silenciosamente vacía.

### Ejemplo de sección v2

```json
{
  "study.collections": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "title": "Primer parcial",
      "description": "Ejercicios y teoría",
      "resourceIds": ["22222222-2222-4222-8222-222222222222"],
      "revision": 3,
      "createdAt": "2026-10-01T12:00:00.000Z",
      "updatedAt": "2026-10-02T12:00:00.000Z"
    }
  ]
}
```

Este ejemplo ilustra **solo una sección** de la exportación de cuenta, no un archivo v2 completo ni la exportación del contenido de los recursos enlazados.

## Verificación y matriz de aceptación

Pruebas agregadas:
- `study-collection-export.reader.spec.ts`: consultas por owner, orden/índice, allowlist, paginación, cursor ligado a cuenta, versión o estructura inválida, presupuesto de páginas, datos corruptos y referencias duplicadas/oversized.
- `account-export-study-collections.contributor.spec.ts`: delegación del owner y presupuesto, transformación de registros sin campos internos, propagación de errores.
- `data-lifecycle.module.spec.ts`: 31 contribuidores exactos en el factory Nest real, protección ante pérdidas/extras, v1 de 30 en registro ampliado, v2 de 31 con mismo owner y límite 100.
- `scripts/test-account-export-b46-integration.mjs`: regresiones estáticas de archivos y contrato.

**Pendiente antes de release:** ejecutar Jest/TypeScript/Prettier/build exact-SHA en checkout, smoke real Mongo/S3, reinicio del worker y pruebas multiusuario, incluyendo offboarding y exportación en curso.

## Integración posterior requerida para #316

1. Rebasar #316 sobre el `main` nuevo; reutilizar el esquema compartido, sin duplicarlo. Resolver el conflicto de `apps/api/src/app.module.ts`, las rutas Web de B40–B44 y la navegación.
2. Confirmar que la colección persistida es un dato portable y parte de la política de cierre de cuenta. El cierre de cuenta existente no borra automáticamente todos los datos privados; se debe definir retención, supresión/desidentificación y tratamiento de referencias. No habilitar CRUD sin decisión implementada.
3. Activar `ACCOUNT_EXPORT_FORMAT_VERSION=2` **en el mismo corte que se habiliten escrituras persistentes**; implementar los smoke reales de exportación, idempotencia y recuperación de trabajo con lease.
4. Actualizar especificación funcional canónica (COL-FR), checklist de privacidad, evidencia de pruebas de backend/cliente y documentación pública, sin confundir el JSON portable de B44 con el archivo global de cuenta v2.

**Un merge de B46 integra la lectura y el cableado de exportación; no constituye validación productiva ni habilitación de Colecciones persistentes.**
