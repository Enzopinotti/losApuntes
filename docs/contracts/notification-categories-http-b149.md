# B149 — Bandeja privada de notificaciones por categoría (HTTP v1)

**Implementación:** backend NestJS `apps/api`. **Frontend:** integración a cargo de la desarrolladora Web, sin cambios de React ni Mobile en este bloque.

## Objetivo

Separar en la bandeja las notificaciones de **actividad social** (follow/solicitudes/aceptaciones) y de **preguntas y respuestas académicas** (respuesta recibida/respuesta aceptada). No se duplican registros ni se reemplaza la bandeja histórica. El filtro y la protección de identidad residen en el servidor.

## GET /notifications/categories/:category

Requiere `AuthSessionGuard` y emite `Cache-Control: private, no-store`.

Categorías: `social` y `qa`. Query: `unreadOnly` booleano, por defecto `false`; `limit` entero 1..30, por defecto 30; `cursor` opcional canónico base64url de 4..512 caracteres.

```json
{
  "items": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "type": "social.followed",
      "actor": {
        "profileId": "44444444-4444-4444-8444-444444444444",
        "displayName": "Compañera",
        "avatarUrl": null
      },
      "target": {
        "type": "profile",
        "id": "33333333-3333-4333-8333-333333333333"
      },
      "readAt": null,
      "createdAt": "2026-10-20T12:00:00.000Z"
    }
  ],
  "nextCursor": null
}
```

La forma de cada ítem es **la misma proyección de la bandeja actual**. La consulta Mongo filtra primero por `userId` autenticado y la lista cerrada de tipos de la categoría; con `unreadOnly=true` también exige `readAt:null`. Luego ordena por `createdAt DESC,id ASC` y lee a lo sumo `limit + 1`. Los perfiles de actores se obtienen en lote mediante `ProfileService.getAttributionsForUsers`; si no hay Profile, `actor` es `null`, sin cambiar la continuidad del ítem.

El cursor está ligado a owner, categoría y estado del filtro `unreadOnly`. No contiene el user ID interno en texto ni es una autorización: cada página vuelve a filtrar en Mongo por el principal autenticado. Es una paginación viva, no una instantánea inmóvil frente a nuevas notificaciones.

Correspondencia cerrada de tipos:
- `social`: `social.followed`, `social.connection_requested`, `social.connection_accepted`.
- `qa`: `qa.question_answered`, `qa.answer_accepted`.

## GET /notifications/categories/unread-counts

Misma autenticación y cabecera `Cache-Control: private, no-store`. Sin parámetros.

```json
{ "socialUnreadCount": 3, "qaUnreadCount": 2 }
```

Hace dos consultas owner-scoped `countDocuments`, restringidas a `readAt:null` y las listas de tipos de arriba. No descarga notificaciones ni perfiles. Los conteos pueden observar estados distintos si hay escrituras concurrentes: no se promete lectura atómica. El contador total de B144 se conserva como endpoint diferente.

## Errores y seguridad

- Sesión ausente: rechazo Auth estándar.
- 422 `NOTIFICATION_CATEGORY_INVALID`: categoría no permitida.
- 422 `NOTIFICATION_CATEGORY_PAGE_INVALID`: filtros o límite inválidos.
- 422 `NOTIFICATION_CATEGORY_CURSOR_INVALID`: token alterado, no canónico o usado con otro owner/categoría/filtro.
- 422 `NOTIFICATION_CATEGORY_OWNER_REQUIRED`: falta principal autenticado en la capa de servicio.
- 503 `NOTIFICATION_CATEGORY_DATA_INVALID`: lectura corrupta, resultado de tamaño imposible, tipos/targets incoherentes, fechas inválidas o cantidades corruptas.
- Los errores reales de Mongo se propagan: jamás se convierten en una bandeja vacía o cero falso.
- Ninguna respuesta incluye `userId`, `actorUserId`, emails, documentos internos ni variables de cuenta.

## Rendimiento, compatibilidad y aceptación

Se registran índices `(userId,type,createdAt DESC,id ASC)` y `(userId,type,readAt,createdAt DESC,id ASC)` antes de la compilación del modelo. No se altera el esquema documental ni las notificaciones existentes. Las rutas `GET /notifications`, `PATCH /notifications/:id/read`, `POST /notifications/read-all` y B144 `GET /notifications/unread-count` conservan sus contratos.

Pruebas: cursores, separación entre cuentas, categoría inválida, paginación estable, proyección pública en lote, actor sin perfil, filas de Mongo corruptas, fallos de storage, cero real y conteos. Requiere CI exact-head: TypeScript, ESLint estricto, Prettier, Jest, coberturas críticas, Quality Gate y auditoría productiva.

**Lanzamiento:** PR draft hasta todos los gates aprobados. Los issues de dependencias #133/#141 siguen bloqueantes; release #353 permanece HOLD. No hay cambios de `apps/web`, `apps/mobile`, Auth, flags, Account Export ni waivers.
