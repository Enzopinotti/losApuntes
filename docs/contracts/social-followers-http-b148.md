# B148 — Mi lista de seguidores (contrato HTTP v1)

**Ámbito:** solo API NestJS y documentación. La interfaz Web y Mobile corresponde a otros carriles de desarrollo.

## Qué habilita

Un usuario autenticado puede consultar **quiénes siguen su perfil**, sin buscar
relaciones ajenas ni exponer identificadores internos de cuenta. Esto completa
el flujo iniciado con `PUT /social/profiles/:profileId/follow` y
`GET /social/me/following` sin alterar sus contratos.

## Endpoints

### GET /social/me/followers

Autenticación: `AuthSessionGuard`, propietario obtenido **exclusivamente**
de la sesión; sin `userId` configurable. Respuesta
`Cache-Control: private, no-store`.

Query: `limit` opcional, entero 1..25 (default 25); `cursor` opcional,
cadena canónica base64url de 4..512 caracteres.

```json
{
  "items": [
    {
      "profile": {
        "profileId": "33333333-3333-4333-8333-333333333333",
        "displayName": "Estudiante",
        "avatarUrl": null
      },
      "followedAt": "2026-10-20T14:00:00.000Z"
    }
  ],
  "nextCursor": null
}
```

Consulta a Mongo por `followeeUserId = authenticated user`, **antes de**
ordenar por `createdAt DESC,id ASC` y limitar a `limit+1`.
La lectura selecciona únicamente `id,followerUserId,followeeUserId,createdAt`;
la proyección pública/privada del nombre y avatar está delegada al servicio
Profile existente y se resuelve **en lote**. Si una relación no tiene perfil
recuperable, no se entrega esa tarjeta, pero el cursor avanza sobre la fila
escaneada. Una página puede tener menos tarjetas que `limit`.

El cursor está vinculado a la cuenta actual mediante un hash de alcance; nunca
incluye el `userId` interno en texto. Es una pista de paginación, **no**
una credencial: cada lectura revalida su filtro Mongo. Cambios simultáneos
en las relaciones pueden modificar la siguiente página.

### GET /social/me/followers/count

Misma autenticación y `Cache-Control: private, no-store`.

```json
{ "followersCount": 7 }
```

Este número cuenta **relaciones follow almacenadas** cuyo `followeeUserId`
es la cuenta autenticada. No equivale necesariamente al número de tarjetas
con Profile recuperable. No se cargan perfiles para el conteo.
Un error de Mongo no se transforma falsamente en cero.

## Seguridad y límites

- Sin sesión se aplica el rechazo Auth estándar.
- 422 `SOCIAL_FOLLOWERS_OWNER_REQUIRED`: falta el owner interno.
- 422 `SOCIAL_FOLLOWERS_LIMIT_INVALID`: límite inválido.
- 422 `SOCIAL_FOLLOWERS_CURSOR_INVALID`: cursor malformado, ajeno o alterado.
- 503 `SOCIAL_FOLLOWERS_DATA_INVALID`: consulta devuelve filas inválidas.
- Una falla real del almacén se propaga; no se fabrican resultados vacíos.
- Respuesta nunca incluye `followerUserId`, `followeeUserId`, emails,
  estado interno de cuenta ni campos de visibilidad Profile.
- Índice `SocialFollow(followeeUserId,createdAt DESC,id ASC)`, registrado
  antes de que Mongoose compile el modelo.
- No se modifica `GET /social/me/following`, follow/unfollow, otras
  relaciones, permisos Auth, esquema de Account Export ni frontend.

## Aceptación y release

Cobertura de cursors, account isolation, filtro Mongo, respuestas vacías,
limit, perfil faltante, tipos malformados y fallos de base de datos. Ejecutar
Jest, Prettier, TypeScript, ESLint estricto, Quality Gate, auditoría productiva
y smoke de runtime sobre el SHA exacto.

**Estado de lanzamiento:** issues #133/#141 bloquean la auditoría; #353 sigue
en HOLD. No hay excepciones nuevas ni habilitación de funcionalidades productivas.
Reconciliar este contrato con el documento canónico de requerimientos 01
en el cierre formal. No se modifican pantallas: el frontend podrá conectar
directamente estas rutas.
