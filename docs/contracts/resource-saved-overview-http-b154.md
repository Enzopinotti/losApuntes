# B154 — Resumen privado de la biblioteca guardada (HTTP v1)

**Alcance:** backend NestJS `apps/api` y contrato HTTP. Sin modificaciones en `apps/web`, `apps/mobile`, Auth, dependencias ni feature flags.

## Objetivo

Un estudiante necesita ver un resumen rápido de los apuntes que guardó: cuántos **continúan siendo accesibles**, de cuántas materias distintas son y cuáles fueron sus últimos cinco guardados. Los endpoints ya existentes `GET /resources/saved`, `/resources/saved/search` y `/resources/saved/subjects` mantienen sus contratos para explorar el detalle.

Una referencia guardada **no** concede acceso permanente al recurso. El resumen de B154 no contabiliza como disponible un recurso que ya no existe, pasó a moderación no disponible o dejó de ser público/compartido con el estudiante.

## Endpoint

`GET /resources/saved/overview`

- Requiere `AuthSessionGuard`, usuario tomado exclusivamente de `request.user.id`. No acepta identificadores de propietario ni filtros de usuario externos.
- Emite `Cache-Control: private, no-store`.
- Sin body ni query. No realiza escrituras.

Respuesta:

```json
{
  "savedResourcesCount": 2,
  "subjectsCount": 1,
  "recentSavedResources": [
    {
      "resourceId": "11111111-1111-4111-8111-111111111111",
      "title": "Introducción a Álgebra",
      "subjectId": "33333333-3333-4333-8333-333333333333",
      "savedAt": "2026-10-20T12:00:00.000Z"
    }
  ]
}
```

- `savedResourcesCount`: cantidad de bookmarks del propietario que **en el instante de la consulta** tienen un Resource disponible y autorizado; puede ser menor que el número bruto de relaciones `resource_saves`.
- `subjectsCount`: cantidad de `subjectId` distintos entre esas referencias accesibles. No es necesariamente igual al total de materias cursadas o seguidas.
- `recentSavedResources`: máximo 5 bookmarks actualmente autorizados, ordenados por `createdAt DESC,resourceId ASC` del bookmark. Los metadatos provienen del Resource autorizado, nunca del vínculo guardado.
- Para biblioteca vacía o sin ningún recurso todavía accesible devuelve contadores `0` y arreglo vacío. Ese cero es un resultado de autorización/consulta exitosa, **no** un valor inventado tras errores de infraestructura.

## Seguridad y arquitectura

Una agregación `ResourceSave` owner-scoped con cuatro pasos:

1. `$match: {userId:authenticatedUserId}` antes de cualquier otro operador.
2. Proyección mínima de `resourceId` y `createdAt`.
3. Reutilización literal del helper existente `authorizedSavedJoinStages`, que comprueba `moderationState=available` y los permisos `public`, recursos de autor propio o `shared` con grant real de `resource_shares`. El helper exige igualdad canónica `resourceId` → `resources.id`.
4. `$facet` sobre **solo las referencias ya autorizadas**: rama `totals` con conteo, `subjects` con agrupamiento de materias y `recent` con sort+limit de 5 y proyección pública mínima.

Se reutilizan los índices existentes de `resource_saves(userId,createdAt,resourceId)`, `resources(id)` y `resource_shares(resourceId,userId)`. Ningún N+1 ni carga completa de recursos al proceso Node.

La agregación tiene `maxTimeMS=8000` y `allowDiskUse=true`, con el control existente `boundedSavedQuery`. Mongo code 50 se informa como `408 RESOURCE_SAVED_QUERY_TIMEOUT`, no como biblioteca vacía. El coste es proporcional a los bookmarks del estudiante y los joins autorizados; no se promete rendimiento constante con bibliotecas enormes.

## Validación y errores

- Sin sesión: rechazo Auth normal.
- Principal de servicio ausente: 422 `RESOURCE_SAVED_OVERVIEW_OWNER_REQUIRED`.
- Estructura de facets incorrecta, conteos inválidos, conteo de materias imposible, filas recientes duplicadas, sin orden o malformadas: 503 `RESOURCE_SAVED_OVERVIEW_DATA_INVALID`.
- Timeout Mongo: `RESOURCE_SAVED_QUERY_TIMEOUT` del servicio de presupuesto existente.
- Errores de Mongo no relativos a timeout: se propagan. Nunca se convierten en ceros.
- La respuesta no devuelve `userId`, `authorUserId`, `ResourceShare`, emails, `searchText`, descripciones ni IDs internos Mongo.
- Se mantiene la autorización de los endpoints existentes para abrir realmente el archivo: el resumen no otorga permiso ni evita cambios de visibilidad futuros.
- Los totales pueden cambiar con nuevos guardados, quitas, moderación o permisos; no son una métrica histórica inmutable.

## Aceptación, integración y release

Pruebas de contrato HTTP (ruta, guard, no-store, usuario de sesión), de agregación (owner-first, mismos joins de seguridad, grupos, orden, limit, timeout), de validación fail-closed (facets/counters/filas corruptas, fechas, duplicados) y propagación de fallos.

La desarrolladora Web puede mostrar las tarjetas de resumen y enlazar cada `resourceId` autorizado con la vista existente. Esta entrega no modifica ninguna pantalla.

**Release HOLD:** auditoría de dependencias productivas issues #133/#141, Quality Gate y release #353. No hay waivers, overrides de seguridad, cambios de lockfile, merge ni despliegue. Backend aislado de los PR B143–B153.
