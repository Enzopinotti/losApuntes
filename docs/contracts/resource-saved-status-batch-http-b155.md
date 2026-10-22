# B155 — Estado de guardado por lote (HTTP v1)

**Alcance:** backend NestJS `apps/api`. Sin pantallas React/Mobile ni cambios a los contratos existentes de Recursos.

## Objetivo

Las tarjetas de apuntes en Descubrir, búsquedas y feed necesitan saber si cada recurso está guardado para mostrar el botón de Guardar o Quitar. Antes no existía una consulta de estado por lote: recorrer `GET /resources/saved` o hacer N consultas independientes resulta ineficiente y puede tomar decisiones con datos obsoletos.

## Endpoint nuevo

`POST /resources/saved/status`

Requiere `AuthSessionGuard`. Solo se recibe el array de IDs públicos; el usuario consultante **siempre** proviene de `request.user.id`. El método POST transporta el lote, **no** crea relaciones ni tiene efectos secundarios. Devuelve `Cache-Control: private, no-store`.

Body:

```json
{
  "resourceIds": [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222"
  ]
}
```

Respuesta:

```json
{
  "items": [
    {
      "resourceId": "11111111-1111-4111-8111-111111111111",
      "isSaved": true
    },
    {
      "resourceId": "22222222-2222-4222-8222-222222222222",
      "isSaved": false
    }
  ]
}
```

- El máximo es **50 IDs UUIDv4 únicos** y el mínimo es uno. No se aceptan IDs duplicados, strings en lugar del arreglo ni un lote excesivo.
- La comparación de UUID no distingue mayúsculas/minúsculas: se normalizan para la búsqueda y detección de duplicados. La respuesta conserva el texto original y el orden enviados por el cliente.
- La respuesta conserva exactamente **el orden y la cantidad** de los IDs solicitados.
- `isSaved=true` exige que exista una relación `resource_saves` de ese usuario **y** que el Resource tenga `moderationState='available'` y siga siendo público, propio o compartido mediante una concesión vigente.
- `isSaved=false` significa únicamente que _no existe una relación guardada actualmente autorizada_. No distingue no guardado de borrado, moderado, privado o con permiso revocado. No expone causas ni existencia.
- La comprobación replica el límite de visibilidad/moderación empleado por la búsqueda de biblioteca guardada; **no** verifica la disponibilidad física del archivo ni sustituye `GET /resources/:id`/`POST .../access`, que revalidan el acceso completo.

## Diseño y privacidad

Una única agregación MongoDB sobre `resource_saves`:

1. `$match: {userId:session.user.id,resourceId:{$in:resourceIds}}`. El filtro por dueño precede todos los joins y límites.
2. `$project` limitado a `resourceId`.
3. Helper **existente** `authorizedSavedJoinStages`: unión indexada con `resources.id`, moderación disponible, unión indexada con `resource_shares(resourceId,userId)`, verificación de estado de visibilidad antes de contabilizar resultados.
4. `$limit: N+1` **después** de autorizar, para detectar resultados duplicados/anómalos, y proyección final exclusivamente de `resourceId`.
5. En memoria se valida que todos los IDs autorizados estén en la solicitud y aparezcan solo una vez, luego se proyecta el estado booleano a la lista original.

Se reutilizan los índices actuales `resource_saves(userId,resourceId)`, `resources(id)` y `resource_shares(resourceId,userId)`; no hay nuevos documentos, índices, lecturas por recurso, migraciones ni modificación de condiciones de permisos.

Una consulta por lote consume hasta `maxTimeMS=8000` y reutiliza `boundedSavedQuery`. No se garantiza snapshot entre solicitudes concurrentes ni persistencia del valor: la interfaz debe refrescar el estado tras Guardar/Quitar y considerar que otra sesión puede cambiarlo.

## Errores y seguridad

- Sin sesión: AuthSessionGuard deniega.
- Solicitud inválida, principal ausente o más de 50 IDs: 422 `RESOURCE_SAVED_STATUS_INPUT_INVALID` desde servicio (el DTO aplica además la validación global HTTP).
- Resultado corrupto/duplicado/superior al lote, o IDs no solicitados: 503 `RESOURCE_SAVED_STATUS_DATA_INVALID`. Nunca se responde todo `false` por una lectura insegura.
- Mongo code 50: RequestTimeoutException `RESOURCE_SAVED_QUERY_TIMEOUT` existente, no se oculta.
- Otros errores de Mongo: se propagan sin convertirlos en respuestas normales.
- No se devuelve `userId`, `authorUserId`, razón de permiso, información de `resource_shares`, metadata privada, contenido ni `_id` Mongo.
- Todas las mutaciones existentes `PUT/DELETE /resources/:id/save` continúan autorizando independientemente; este estado no concede permiso para hacer una operación posterior.

## Integración con frontend y aceptación

El frontend puede tomar los IDs visibles de hasta 50 tarjetas, llamar una sola vez a este endpoint y asociar los `items` a las tarjetas por `resourceId`. En caso de nuevos filtros, paginación o cambio de cuenta debe solicitar nuevamente el estado; después de Guardar/Quitar debe refrescar el recurso afectado. Las tarjetas no deben inferir que `false` significa `Resource inexistente`.

Pruebas: aislamiento del dueño, mismo helper de moderación y concesiones, 50-ID max, orden estable de salida, IDs duplicados o ajenos, base corrupta, proyección sin datos internos, timeout, error Mongo, Auth guard, DTO y `private,no-store`. CI exact-head: Jest, TypeScript, Prettier, ESLint estricto, diez coberturas críticas, Quality Gate y auditoría productiva.

**Integración:** este PR registra dos componentes en `apps/api/src/resources/resources.module.ts`. B154 (PR #482) modifica ese mismo archivo: al consolidar deben conservarse **ambos** controladores y servicios; no se puede sobrescribir uno con el otro.

**Release HOLD:** issues #133/#141, release #353. No se modifican lockfile, waivers, controles, variables de entorno ni apps frontend. No realizar merge ni deploy con auditoría o Quality Gate bloqueantes.
