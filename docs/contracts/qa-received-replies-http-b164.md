# B164 — Respuestas recibidas en mis preguntas

## Objetivo

Proveer al estudiante una bandeja de **respuestas visibles recibidas en
sus propias preguntas**, con orden cronológico y paginación segura por cursor.
Es una funcionalidad distinta de B161 (`qa/me/follow-ups`, que lista preguntas
abiertas para revisar) y B162 (conversaciones donde el usuario participó).
No pretende inferir quién leyó una respuesta ni generar notificaciones.

## HTTP

**GET /qa/me/received-replies?cursor=<opaque>**

- `AuthSessionGuard` obligatorio. El único dueño autorizado es
  `request.user.id`; no existe parámetro para seleccionar otra cuenta.
- `cursor` opcional, solo una cadena base64url canónica. En el primer
  acceso se omite. Token versionado `v=1`, etiqueta SHA-256 truncada
  derivada del dueño, `createdAt` ISO UTC canónico y UUIDv4 de la última
  respuesta de la página anterior. La etiqueta evita reutilización accidental
  entre cuentas, **no sustituye autenticación ni firma criptográfica**.
- `Cache-Control: private, no-store`.
- Máximo **10 respuestas** por página; el servidor lee una onceava fila
  para decidir si hay página siguiente.

Ejemplo ilustrativo de respuesta:

```json
{
  "items": [
    {
      "answerId": "9a73b180-ef29-4489-b7c5-000000000001",
      "questionId": "a7f8eab6-42c8-4539-9fcd-8ce5d8794581",
      "subjectId": "a2f47be6-e403-46ac-a913-90b778a92d8c",
      "questionTitle": "¿Cómo preparo el final de Álgebra?",
      "answeredAt": "2026-10-20T15:00:00.000Z",
      "isAccepted": false
    }
  ],
  "nextCursor": null
}
```

Una cuenta sin respuestas disponibles obtiene
`{"items":[],"nextCursor":null}`. Un cursor malformado, no canónico,
reutilizado entre cuentas o con fecha/UUID incorrectos produce **HTTP 422**
con código `QA_RECEIVED_REPLIES_CURSOR_INVALID`. El cliente debe
descartarlo y volver al inicio si cambia de cuenta.

## Reglas de visibilidad y orden

- La consulta empieza con las **preguntas del usuario autenticado**:
  `authorUserId=sessionOwner`, `moderationState=available`,
  `state=open|closed`. No se incluyen preguntas ocultas, eliminadas,
  huérfanas ni estados desconocidos.
- En `answers` solo se incluyen respuestas `moderationState=available`,
  incluso cuando el `answerCount` de la pregunta refleje respuestas
  moderadas. Ninguna respuesta o título ocultado debe filtrarse al cliente.
- Incluye respuestas visibles de cualquier autor, incluso las propias
  si el dueño respondió a su pregunta; no publica la identidad ni el texto
  de ningún autor/respuesta, solo IDs de navegación y metadatos autorizados.
- `isAccepted` es verdadero únicamente cuando el Answer coincide con
  `Question.acceptedAnswerId`. No indica calidad subjetiva.
- Orden global estable **`answeredAt DESC,answerId ASC`**.
  `answeredAt` usa `Answer.createdAt`, no `updatedAt`, por lo que
  editar una respuesta no la reordena y no se presentan falsos «nuevos».
- El cursor avanza por keyset:
  `createdAt < cursor.createdAt` o mismo timestamp e `id > cursor.id`.
  Respuestas posteriores pueden aparecer al volver a la primera página;
  cambios de moderación pueden retirar elementos entre consultas. No hay
  snapshot transaccional ni garantía de conteo total.

## Almacenamiento, performance y defensas

Una agregación Mongo de solo lectura arranca en `questions` con filtro
**owner-first**. Usa `$lookup` desde `answers.questionId`
(indexado), filtrando respuestas disponibles. Dentro del join aplica el
cursor **antes** de ordenar y limitar a 11 por pregunta. Esto evita que
una sola pregunta materialice un array ilimitado. Luego `$unwind`,
`$project`, `$sort` global y `$limit=11` producen una página de
hasta 10 elementos. La consulta tiene `maxTimeMS=5000`.

Con muchas preguntas propias, el procesamiento de Mongo puede seguir siendo
costoso; el límite de resultado y de tiempo **no garantizan CPU constante**.
Los errores de Mongo se propagan; nunca se inventan filas vacías. Valores
almacenados inválidos, IDs de Answer no UUIDv4, fechas inválidas, duplicados
o un resultado de más de 11 filas producen HTTP 503
`QA_RECEIVED_REPLIES_UNAVAILABLE`.

El backend no agrega escrituras, migraciones, cambios de índices,
autenticación, esquemas Q&A ni lockfile. Solo se registra un nuevo módulo
Nest, sus pruebas y el contrato. No se modifica `apps/web` o
`apps/mobile`.

## Criterios de aceptación y release

- Pruebas Jest de cursor canónico, owner binding, input corrupto,
  búsqueda por dueño, moderación en ambos lados, límite **dentro** del join,
  orden cronológico y desempate, proyección mínima, página siguiente,
  duplicados, fechas inválidas y errores de Mongo.
- Pruebas del controlador: guard de sesión, cabecera no-store, autoridad
  desde `request.user.id`.
- Ejecutar ESLint API estricto, TypeScript, Prettier, Jest, coberturas críticas,
  Quality Gate, smoke de runtime y auditoría prod sobre SHA exacto.
- El pipeline está cubierto por pruebas unitarias y de contrato; **una
  aceptación específica contra Mongo real** sigue siendo necesaria para
  afirmar la integración del cursor con `$lookup`.
- Mantener #353 release **HOLD** y los issues de seguridad #133, #141
  y #492 mientras existan advisories high/critical. No waivers, merges ni
  despliegues si la auditoría continúa fallando.
