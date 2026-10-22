# B150 — Estado de relación con un perfil público (HTTP v1)

**Entrega:** únicamente backend NestJS `apps/api`. No incluye pantallas React ni Mobile.

## Objetivo

Cuando un estudiante abre el perfil público de otra persona, el cliente necesita conocer sus **acciones sociales posibles** sin recorrer todas las páginas de seguidores y conexiones. Esta consulta obtiene el estado para el par concreto desde la sesión autenticada y el `profileId` público, sin exponer IDs internos de cuenta ni modificar relaciones.

## Endpoint

`GET /social/profiles/:profileId/relationship`

- Sesión `AuthSessionGuard` requerida.
- Parámetro `profileId` UUIDv4, validado en el controlador.
- `Cache-Control: private, no-store`.
- Se comprueba primero el estado de ciclo de vida con `ProfileService.resolvePublicProfileUserIdByProfileId`; un perfil cerrado/inexistente no entrega información social y no se carga la proyección completa del perfil.
- El identificador público se traduce al ID de cuenta sólo dentro del servidor.
- `userId` de usuario consultante **siempre** se toma de `request.user.id`; no hay parámetro de usuario solicitante.

### Ejemplo de resultado

```json
{
  "isSelf": false,
  "isFollowing": true,
  "followsYou": true,
  "connection": {
    "id": "22222222-2222-4222-8222-222222222222",
    "status": "pending",
    "requestedByMe": false,
    "incoming": true,
    "respondedAt": null
  }
}
```

- `isSelf=true`: la cuenta abrió su propio perfil. `isFollowing` y `followsYou` son `false`, `connection=null` sin consultar Mongo.
- `isFollowing`: existe `social_follows` con actor como `followerUserId` y destino como `followeeUserId`.
- `followsYou`: existe relación inversa de seguimiento hacia el actor, visible para él.
- `connection`: `null` si las dos cuentas no tienen conexión persistida; caso contrario se muestra id público de relación, `status` existente (`pending`, `accepted`, `declined`, `disconnected`), `requestedByMe`, `incoming` y fecha `respondedAt`.
- `incoming=true` sólo si la conexión está `pending` y el solicitante es la **otra persona**. La acción de aceptar/rechazar existente debe seguir revalidando autorización y versión en el servidor.
- Esta lectura no concede acceso a un perfil privado, no reemplaza la autorización de las mutaciones ni cambia el orden de las relaciones.

## Aislamiento y eficiencia

Dos consultas indexadas `findOne` a `social_follows` (actor→destino y destino→actor) y una consulta `findOne` a `social_connections` usando `userLowId,userHighId` ordenados alfabéticamente, como hace la lógica de escritura. Se leen sólo los campos necesarios mediante `select`, sin búsquedas globales ni recorrido de páginas.

Se conserva el esquema existente y sus índices únicos. No se agregan colecciones, flags ni dependencias.

## Estados de error

- No autenticado: comportamiento estándar de `AuthSessionGuard`.
- Perfil no accesible/cerrado: 404 de Profile.
- Identificador de perfil sin resolución: 404 `SOCIAL_RELATIONSHIP_PROFILE_NOT_FOUND`.
- Principal de backend inválido: 422 `SOCIAL_RELATIONSHIP_VIEWER_REQUIRED`.
- Relaciones corruptas, estado desconocido, fecha inválida o participantes inesperados: 503 `SOCIAL_RELATIONSHIP_DATA_INVALID`.
- Errores reales de Mongo: se propagan sin convertir el estado en `false` o `null`.

No se devuelve `followerUserId`, `followeeUserId`, `requestedByUserId`, correo ni atributos de visibilidad. Se valida el resultado almacenado antes de producir la respuesta.

## Integración para el frontend

Con este contrato la interfaz puede consultar una sola vez el estado al abrir
un perfil y actualizarlo después de llamar a:

- `PUT /social/profiles/:profileId/follow` o `DELETE .../follow`.
- `POST /social/profiles/:profileId/connections`.
- `POST /social/connections/:id/accept` o `/decline`.
- `DELETE /social/connections/:id`.

Es una lectura puntual _best effort_; otro dispositivo puede cambiar la relación entre la consulta y la mutación. La API de escritura sigue siendo fuente de verdad. No se incorporaron botones/pantallas.

## Aceptación y release

Tests unitarios: ausencia de relaciones, perfil propio, follow recíproco, conexión entrante/saliente, orden del par, estado aceptado, control del perfil cerrado, principal inválido, datos cruzados, timestamps corruptos, error Mongo, ruta con Auth y `no-store`. CI exact-head: related Jest, Prettier, TS, API ESLint, 10 critical coverages, Quality Gate y Production Dependency Audit.

**HOLD:** issues de dependencias #133/#141, release #353. No se habilita despliegue, no se editan controles de auditoría ni se otorgan waivers. Requisito propuesto `SOC-FR-008` pendiente de reconciliar en la especificación canónica 01.
