# Study Collections HTTP v1 — private study kits

**Estado:** nueva funcionalidad en desarrollo; no validada para producción.  
**Requisitos propuestos:** COL-FR-001 a COL-FR-006 (pendiente de reconciliación en el documento canónico 01).  
**Alcance:** colecciones privadas por Account, sin publicación ni sharing; no son Resources ni grants de lectura.

## User journeys y límites

- Crear una colección para un parcial/materia con nombre y descripción opcional.
- Listar colecciones propias, renombrar, borrar, agregar/quitar apuntes y retomar desde su detalle.
- La colección no modifica Resource, ResourceSave ni Academic Graph.
- Agregar requiere que el actor pueda leer el Resource en ese momento. Leer el contenido vuelve a verificar ResourceService.get; se devuelve `resource: null` cuando un elemento dejó de ser legible, sin título/file metadata.
- Pérdida de acceso, moderación o cambio de visibilidad se reflejan sin crear permiso durable. Nunca devolver signed URLs en colecciones.
- Idempotency `operationKey` UUIDv4 para creación. Igual clave + igual payload normalizado devuelve el mismo ID; clave reutilizada con distinto contenido devuelve conflicto.
- Cada colección admite hasta 100 referencias. La lista de colecciones y los ítems están paginados; no se envían colecciones ajenas.
- La mutación de nombre exige `expectedRevision`; una modificación concurrente devuelve conflicto. Las modificaciones de miembros incrementan revisión sólo cuando cambian algo.
- Los cursores de miembros contienen revisión y posición y son inválidos al cambiar la colección. Los de listado incluyen owner para no poder reutilizarlos entre cuentas.

Web debe tratar cada cursor como consumible dentro del listado de la sesión o
de la colección seleccionada: deduplicar colecciones por id y miembros por
`resourceId`, detenerse si la respuesta repite el cursor solicitado o uno ya
recorrido, y volver a pedir la primera página para reiniciar. Un
`STUDY_COLLECTION_CURSOR_STALE` descarta la cadena de miembros y requiere
actualizar la colección antes de continuar. Los errores transitorios conservan
la página y el cursor para reintentar.

## Endpoints

Todos bajo `/study-collections`, con `AuthSessionGuard`, `Cache-Control: private, no-store`.

| Método | Ruta | Respuesta |
| --- | --- | --- |
| POST | / | `{collection}` (operationKey,title,description?) |
| GET | /?limit=25&cursor= | `{items,nextCursor}` |
| GET | /:id | `{collection}` |
| PATCH | /:id | `{collection}` (expectedRevision,title?,description?) |
| DELETE | /:id | 200 sin cuerpo; segunda eliminación: 404 |
| GET | /:id/resources?limit=20&cursor= | `{items,nextCursor,revision}` |
| PUT | /:id/resources/:resourceId | `{collection}` idempotente |
| DELETE | /:id/resources/:resourceId | `{collection}` sin condición (compatible) |\n| DELETE | /:id/resources/:resourceId?expectedRevision=N | `{collection}` condicionado por revisión y accesibilidad; 409 si hay cambios |

**B57 — Eliminación condicional para recuperación:** `expectedRevision` es
opcional y debe ser un entero positivo seguro. Cuando está presente, el
servicio comprueba que la colección pertenezca al actor, que su revisión y
referencia coincidan y que `ResourceService.get` rechace con 403/404 antes
de permitir quitar el vínculo. Mongo exige la revisión **dentro del mismo
`findOneAndUpdate` transaccional**. Si falla la precondición, responde
409 `STUDY_COLLECTION_REVISION_CONFLICT` o
`STUDY_COLLECTION_REFERENCE_CHANGED`, sin eliminar otra referencia.
Si el apunte sigue siendo accesible, responde 409
`STUDY_COLLECTION_REFERENCE_ACCESSIBLE`. Los errores de lectura diferentes
de 403/404 se propagan sin tratarse como falta de acceso. Los `DELETE`
sin `expectedRevision` conservan su semántica normal idempotente.

Este control elimina la carrera por **revisión de Colección**, pero no
convierte la comprobación de permisos del recurso en una operación atómica
entre servicios. La revalidación de permisos se realiza en el backend
inmediatamente antes del CAS; no se habilita ninguna limpieza automática.

`collection` = id,title,description,resourceCount,revision,createdAt,updatedAt.  
`items[]` = `{resourceId,resource:ResourceView|null}`; null obliga a UI a ofrecer quitar sin abrir.  
IDs ruta UUIDv4. Títulos colapsan whitespace NFC, nunca vacíos tras trim. Description opcional hasta 500.

## Seguridad y riesgos pendientes de release

- Collections es ownership-only: no existe ruta pública ni modo de compartir en v1.
- Nunca derivar permiso de `resourceIds`, cache local o enlace a colección.
- No mezclar estas preferencias privadas con ranking, recruiting o telemetría.
- Antes de un release con creación real de datos: integrar la sección en account-export y lifecycle/retention, registrar el requisito en 01 y ejecutar exact-head tests, Mongo runtime, navegador y audit de dependencias.
