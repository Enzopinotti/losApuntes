# B151 — Colecciones propias que contienen un recurso (HTTP v1)

**Alcance:** únicamente backend `apps/api`. No toca `apps/web`, `apps/mobile`, ni interfaces de la desarrolladora frontend.

## Objetivo funcional

Cuando una persona abre un apunte, debe poder ver **en cuáles de sus colecciones lo guardó** sin descargar todas las colecciones ni consultar los recursos de cada una. Esta consulta no cambia los vínculos existentes ni concede autorización nueva. Las acciones de agregar y quitar continúan usando los endpoints de Study Collections actuales.

## Endpoint

`GET /study-collections/resources/:resourceId/membership?limit=25&cursor=<opaque>`

- Requiere `AuthSessionGuard` **y** `StudyCollectionsFeatureGuard`, que conserva la política de activación existente; sin flag habilitado, se rechaza.
- `resourceId` UUIDv4 validado en la ruta. La identidad de quien consulta se obtiene **solo** de `request.user.id`.
- `Cache-Control: private, no-store`; nunca se cachea una selección personalizada entre usuarios.
- `limit` entero 1..25 (predeterminado 25). `cursor` canónico base64url de 4..512 caracteres, asociado a la cuenta y al recurso.
- Antes de consultar Mongo se llama `ResourceService.get(resourceId, ownerUserId)`. Las denegaciones, el recurso no encontrado y los fallos de Resource permanecen como errores; la API no devuelve memberships al no poder comprobar acceso.
- Mongo filtra `ownerUserId` y `resourceIds=resourceId` **antes** de orden y límite. Orden: `updatedAt DESC, id ASC`; ventana `limit + 1` y cursor de continuación por fecha e id.
- Solo devuelve proyección mínima de colecciones propias: `id`, `title`, `resourceCount`, `revision`, `updatedAt`.

Ejemplo:

```json
{
  "items": [
    {
      "id": "22222222-2222-4222-8222-222222222222",
      "title": "Parciales de Análisis",
      "resourceCount": 6,
      "revision": 3,
      "updatedAt": "2026-10-20T13:00:00.000Z"
    }
  ],
  "nextCursor": null
}
```

Una lista vacía significa que la cuenta **sí tiene acceso al recurso** pero no está presente en ninguna de sus colecciones. No representa un error de Mongo, un rechazo de permisos ni un recurso eliminado.

## Seguridad, consistencia y errores

- Cualquier sesión ajena produce su propio listado, nunca el del propietario de otra cuenta.
- El cursor incluye solamente un hash de alcance, recurso e información de orden; **no** contiene el user ID en claro ni actúa como una credencial.
- Cursor ajeno, alterado, no canónico o reutilizado para otro recurso: 422 `STUDY_COLLECTION_MEMBERSHIP_CURSOR_INVALID`.
- Dueño interno inexistente: 422 `STUDY_COLLECTION_MEMBERSHIP_OWNER_REQUIRED`; identificador de recurso inválido: 422 `STUDY_COLLECTION_MEMBERSHIP_RESOURCE_INVALID`; tamaño inválido: 422 `STUDY_COLLECTION_MEMBERSHIP_LIMIT_INVALID`.
- Registros de colección corruptos (dueño cruzado, recurso no presente, duplicados, IDs/fechas/revisión inválidos): 503 `STUDY_COLLECTION_MEMBERSHIP_DATA_INVALID`.
- Rechazo o inexistencia de un recurso: se propaga la excepción del servicio Resource, sin información de pertenencia.
- Fallo real de Mongo: se propaga, sin inventar una lista vacía.

Los cursores son pistas de paginación, no snapshots de transacciones. Si otra pestaña agrega o quita un recurso, el contenido puede cambiar entre páginas y debe refrescarse al guardar/quitar.

## Rendimiento y compatibilidad

Se agrega el índice multikey `(ownerUserId,resourceIds,updatedAt DESC,id ASC)` al esquema ya existente, registrado antes de compilar el modelo Mongoose. No se duplican recursos, archivos o colecciones y no se cambia la persistencia documental.

La pantalla de selección puede cargar primero esta lista y marcar las colecciones correspondientes. Para quitar o agregar debe invocar las mutaciones ya existentes, que revalidan propietario, autorización de Resource y revisión según el contrato. Este endpoint **no autoriza automáticamente** futuras operaciones.

## Aceptación

Pruebas de cursores entre cuentas y recursos, autenticación + feature flag, UUID, consulta owner-scoped, autorización de Resource previa, límite, proyección segura, integridad de filas, fechas y fallos. Validación sobre SHA exacto con Jest relacionado, TypeScript, ESLint, Prettier, coberturas críticas, Quality Gate y auditoría productiva.

**Estado de release:** issues #133/#141 y release #353 mantienen el HOLD de seguridad. Sin waivers nuevos, despliegues ni modificaciones al frontend. Requisito B151 pendiente de reconciliar con la especificación funcional canónica.
