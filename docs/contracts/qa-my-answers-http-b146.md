# B146 — Mis respuestas académicas (HTTP v1)

**Estado:** propuesto para revisión, backend-only. No modifica los clientes Web/Mobile.

## Caso de uso

Una cuenta autenticada puede revisar las respuestas que publicó en preguntas académicas todavía visibles, retomar el hilo por `question.id` y distinguir respuestas aceptadas. El listado no expone datos de terceros ni concede acceso a una pregunta moderada.

## Endpoint

`GET /answers/mine?limit=25&cursor=<opaque>`

- `AuthSessionGuard`; owner exclusivamente `request.user.id`, no hay `authorId` externo.
- `Cache-Control: private, no-store`.
- `limit` 1..25, default 25; cursor opcional canónico base64url, vinculado al propietario y longitud máxima 512.
- Orden `createdAt DESC, id ASC`; el cursor devuelve 422 `QA_MY_ANSWERS_CURSOR_INVALID` ante alteración, fechas/UUID inválidos u otro usuario.
- El pipeline Mongo exige `answers.authorUserId = account ID` y `answers.moderationState = available`, y mediante `$lookup` por `questions.id` exige `questions.moderationState = available`. `$unwind` de padre visible sucede antes del `limit + 1`; una pregunta oculta o inexistente no deja escapar una respuesta.
- No hay mutaciones, estadísticas públicas, seguimiento ni notificaciones; no se cambia el modelo de permisos.

Ejemplo de respuesta:

```json
{
  "items": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "question": {
        "id": "22222222-2222-4222-8222-222222222222",
        "subjectId": "33333333-3333-4333-8333-333333333333",
        "title": "Normalización en SQL",
        "state": "open"
      },
      "body": "La normalización separa dependencias transitivas.",
      "revision": 2,
      "accepted": true,
      "createdAt": "2026-10-19T20:00:00.000Z",
      "updatedAt": "2026-10-19T20:00:00.000Z"
    }
  ],
  "nextCursor": null
}
```

`nextCursor` es `null` cuando no existe una siguiente página; nunca contiene el Account ID original. Los cursores son sugerencias de posición, **no tokens de autenticación** ni instantáneas consistentes entre escrituras.

## Errores

- Sin sesión: AuthSessionGuard devuelve la respuesta de autenticación estándar.
- `422 QA_MY_ANSWERS_LIMIT_INVALID`: límite inválido.
- `422 QA_MY_ANSWERS_CURSOR_INVALID`: cursor inválido o ajeno.
- `503 QA_MY_ANSWERS_DATA_INVALID`: forma de lectura no segura.
- Fallo Mongo: se propaga, jamás se responde una bandeja vacía falsa.

## Rendimiento, privacidad y release

Índice compuesto `answers(authorUserId,moderationState,createdAt DESC,id ASC)`. `questions.id` tiene índice único existente; lookup retiene únicamente las columnas permitidas. Los campos `authorUserId`, `moderationState`, `searchText`, datos internos de Profile y cualquier marca privada no forman parte de la respuesta.

El frontend puede ofrecer un historial propio y un enlace a `GET /questions/:id`, que revalida los permisos nuevamente. No hay cambios en React.

Tests unitarios, schema metadata, Jest coverage, lint/TS, container smoke y auditoría productiva deben aprobar sobre el SHA exacto antes de integrar; auditoría #133/#141 y release #353 continúan **HOLD**. Reconciliar el requisito propuesto `QA-FR-005` en la especificación canónica del proyecto antes del cierre.
