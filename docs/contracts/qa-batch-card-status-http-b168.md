# B168 — Refrescar el estado de tarjetas de Q&A por lote

## Problema y alcance

Las tarjetas de preguntas de Q&A en el inicio, resultados de búsqueda y
listados de apoyo pueden quedar desactualizadas entre pantallas: un autor
puede cerrar la pregunta, aparecer una respuesta visible, ocultarse una
respuesta por moderación o dejar de estar disponible el contenido original.
B168 permite refrescar **hasta 20 preguntas conocidas** en una solicitud
sin que Web/Mobile tengan que consultar cada pregunta individualmente.

Complementa B145 (Mis preguntas), B161 (Seguimiento), B164 (Respuestas
recibidas), B166 (Necesitan ayuda) y B167 (Dónde puedo ayudar). Está
implementado exclusivamente sobre los esquemas de Q&A de `main`, sin
importar módulos de esos PR pendientes.

## HTTP: POST /qa/discovery/batch-question-status

**Lectura idempotente** implementada con POST para admitir una lista limitada
de IDs en el body; no crea, actualiza ni modifica preguntas o respuestas.

Requiere `AuthSessionGuard` revocable. Ejemplo de solicitud:

```json
{
  "questionIds": [
    "269f2da7-f70c-418d-9151-000000000001",
    "269f2da7-f70c-418d-9151-000000000002"
  ]
}
```

Se admiten de **1 a 20 UUIDv4 canónicos distintos**, en minúsculas,
sin parámetros extra. El DTO usa `class-validator` y el servicio
**vuelve a validar de manera defensiva** antes de acceder a Mongo.
Una entrada incorrecta produce HTTP 400 con código
`QA_CARD_STATUS_INPUT_INVALID` en el chequeo del servicio (el
`ValidationPipe` global puede responder su 400 estándar previamente).

Respuesta HTTP **200** (`@HttpCode(200)` sobre este POST de solo
lectura), con `Cache-Control: private, no-store`:

```json
{
  "items": [
    {
      "questionId": "269f2da7-f70c-418d-9151-000000000001",
      "subjectId": "bbde8519-5796-429c-b078-7b705edc5a0b",
      "state": "open",
      "isOwnQuestion": false,
      "hasVisibleAnswer": true,
      "hasAcceptedVisibleAnswer": false
    }
  ]
}
```

Los resultados se ordenan **exactamente** como los IDs solicitados,
pero se **omiten** las Questions ausentes, ocultas por moderación o
con estados desconocidos. El cliente no recibe un registro de error
por cada ID ausente, ni un diagnóstico que diferencie inexistencia
de ocultamiento. Una lista vacía de resultados es válida cuando
ninguna pregunta solicitada continúa públicamente disponible.

## Seguridad y significado de los campos

- Solo se consultan Questions con `moderationState=available` y
  `state=open|closed`; `Question.id` debe estar en la lista recibida.
- `isOwnQuestion` compara `Question.authorUserId` con
  `request.user.id` **en el servidor**; el cliente no puede consultar
  el estado de propiedad relativo a otro usuario.
- `hasVisibleAnswer`: existe al menos una Answer con
  `questionId == Question.id` y `moderationState=available`.
  No se usa `Question.answerCount`, porque puede incluir respuestas
  ocultadas. La comprobación es de existencia (máximo una fila).
- `hasAcceptedVisibleAnswer`: existe una Answer disponible cuyo
  `id == Question.acceptedAnswerId` **y**
  `questionId == Question.id`. El `acceptedAnswerId` nulo no
  produce coincidencias. Si una respuesta aceptada se oculta, el
  booleano se vuelve falso; no se expone su identidad.
- El endpoint no devuelve título, cuerpo, texto de respuesta,
  ID de autor, correo, perfil, moderación interna, reportes,
  `acceptedAnswerId` ni datos de otras materias.
- No equivale a un permiso para responder o aceptar una respuesta:
  las rutas originales deben comprobar sesión, email verificado,
  autoría y revisiones cuando la acción realmente se ejecuta.
- Tampoco señala respuestas no leídas o nuevas. Un estado booleano
  sólo representa una observación del momento de consulta.

## Persistencia y rendimiento

Una sola agregación `questions.aggregate`:

1. `$match` por `id:{$in:questionIds}`, Question available y
   estado válido, aprovechando el índice único existente por ID.
2. `$limit:20` antes de cualquier join, como defensa adicional.
3. Dos `$lookup` de `answers` distintos, ambos con proyección
   mínima y `$limit:1`: uno comprueba cualquier respuesta disponible
   y otro verifica que la respuesta aceptada sea visible y pertenezca
   a la pregunta consultada.
4. `$project` emite únicamente identificadores permitidos y
   estados booleanos. En Node, los resultados se validan y
   reconstruyen en el orden solicitado.

La ejecución tiene `maxTimeMS=5000`; no hay bucles de queries N+1
ni arrays sin límite de Answers. El costo no es constante si la
colección crece, aunque el payload y cada unión estén acotados.
No hay garantía de snapshot transaccional: moderación y aceptaciones
concurrentes pueden modificar los resultados en la próxima llamada.

Rows corruptas, duplicadas, de IDs no solicitados, con datos
inconsistentes o más resultados que IDs requeridos generan HTTP 503
`QA_CARD_STATUS_UNAVAILABLE`. Los fallos reales del driver se
propagan; **no se fabrican estados vacíos** para ocultarlos.

## Validación del carrier y aceptación pendiente

- El carrier conserva los 13 commits atómicos originales de B168 sobre
  `main@047c70d` y suma un commit separado de evidencia; no se hace
  squash.
- Jest service cubre orden solicitado, preguntas moderadas/ausentes,
  autoridad de sesión, los dos joins acotados, aceptación visible,
  proyección, límites, payload inválido y fallos Mongo. Controller/DTO
  cubre sesión, `no-store`, ruta POST, input y autoridad.
- Validación local del carrier: 2 suites / 32 pruebas, API TypeScript,
  ESLint sin warnings, Prettier API, `nest build`, Prettier del contrato
  y `git diff --check` — PASS.
- No se ejecutó CI. Los tests usan mocks; **no se validó la agregación
  contra Mongo real**. Este entorno no tiene daemon Docker ni `mongod`.
  Ejecutar aceptación con una réplica aislada antes de producción.
- No cambia Web/Mobile, Q&A core, autenticación, schemas, índices,
  migraciones, lockfile, dependencias ni workflows. La integración del
  código no acredita runtime ni habilita un despliegue.
