# B167 — Dónde puedo ayudar: oportunidades Q&A en mis materias

## Propósito

Un estudiante consulta sus **materias cursadas actualmente** y ve en cuáles
hay más preguntas públicas y abiertas de otros estudiantes que todavía no
recibieron ninguna respuesta visible. Permite decidir dónde colaborar antes
de entrar al detalle de descubrimiento por materia de B166.

Este contrato es independiente de B166: B167 resume los conteos usando los
esquemas existentes de participación, Questions y Answers de `main`.
No agrega notificaciones, recompensas, reputación, ranking de estudiantes,
datos de cursadas ajenas ni un estado de "pregunta urgente".

## GET /qa/me/help-opportunities

- Requiere el `AuthSessionGuard` revocable. El único dueño autorizado se
  deriva de `request.user.id`; no se aceptan filtros de cuentas externas.
- Respuesta `Cache-Control: private, no-store`.
- Sin query parameters en v1. Endpoint de lectura, sin escrituras.
- Respuesta 200:

```json
{
  "items": [
    {
      "subjectId": "b14211d1-6f33-4e14-a946-000000000001",
      "unansweredPeerQuestions": 5
    },
    {
      "subjectId": "b14211d1-6f33-4e14-a946-000000000002",
      "unansweredPeerQuestions": 0
    }
  ],
  "hasMoreSubjects": false
}
```

`items` incluye **hasta 12 materias** en las que la cuenta posee una
`AcademicSubjectParticipation` con `state=current`. Varias participaciones
de la misma materia por distintas comisiones se consolidan en una. Si hay más
de 12 materias distintas actuales, se seleccionan las 12 cuya participación
fue actualizada más recientemente (desempate por `subjectId`) y
`hasMoreSubjects=true`. Es **un resumen acotado, no una estadística
exhaustiva de toda la vida académica**.

Dentro de estas 12 materias seleccionadas, las tarjetas se ordenan por
`unansweredPeerQuestions DESC, subjectId ASC`; las que no tienen
preguntas elegibles se muestran explícitamente con conteo 0.

## Conteo y privacidad

Cada `unansweredPeerQuestions` cuenta únicamente Questions que:
1. Coincidan con el `subjectId` seleccionado desde las participaciones
   actuales de esa cuenta.
2. Sean `state=open`, `moderationState=available`.
3. Tengan `authorUserId != request.user.id` (las preguntas propias no
   son oportunidades de responder a terceros).
4. No posean respuestas `Answer.moderationState=available`.

Las respuestas ocultas por moderación no descalifican una pregunta, aunque
estén incluidas en el campo almacenado `Question.answerCount`; el servicio
**no utiliza ese contador**. El join enlaza
`Answer.questionId` con `Question.id` usando `$$parentId`, y
solo verifica existencia (`$limit:1`). No incluye cuerpo, título, autor,
reportes ni estados internos de terceros en la respuesta.

La privacidad del estudiante se protege en el filtro de participaciones
`userId=sessionOwner`. El resultado no ofrece un endpoint para consultar
las materias actuales o el conjunto de intereses académicos de otra cuenta.

## Consultas y rendimiento

1. Agregación a `academic_subject_participations` filtrada por dueño y
   estado `current`; agrupa `subjectId` únicos, ordena por última
   actualización, limita a 13 (12+1) y solo proyecta ID.
2. Si no hay materias, responde `items:[]` y no consulta Q&A.
3. Agregación a `questions`, filtrando por las 12 materias admitidas,
   open/available y `authorUserId != owner`. Usa un `$lookup`
   limitado sobre `answers` disponibles, filtra consultas sin respuestas
   visibles y agrupa por materia en Mongo. Devuelve como máximo 12
   grupos válidos. El resto de materias se rellena con cero en la API.

Ambas agregaciones usan `maxTimeMS=5000`; no hay fanout a otras cuentas
ni N+1 desde Node. La salida al cliente es siempre acotada. Escanear
preguntas públicas en muchas materias puede seguir siendo costoso y el
tiempo máximo **no garantiza CPU constante**.

Datos corruptos (materias duplicadas tras el agrupamiento, UUID inválido,
grupo no seleccionado, conteos cero/no enteros/negativos/desbordados,
más grupos que el límite) devuelven HTTP 503 con código
`QA_HELP_OPPORTUNITIES_UNAVAILABLE`. Los errores del driver se propagan;
no se convierte un fallo de base de datos en conteos falsos de cero.
La vista no garantiza snapshot transaccional: otra persona puede responder
entre el resumen y el detalle. La navegación debe consultar el estado
actual con el endpoint Q&A autorizado.

## Entregables y publicación

- Módulo Nest autónomo `qa-help-opportunities`, con service/controller y
  dos suites Jest; registro exclusivamente en `app.module.ts`.
- Pruebas de `AuthSessionGuard`/no-store, owner-first, current-only,
  deduplicación por materia, ausencia de consultas para usuarios sin
  cursadas actuales, moderación de Questions y Answers, conexión segura
  `Answer.questionId = $$parentId`, 12+1, orden, ceros y fail-closed
  ante corrupción y errores de Mongo.
- Sin tocar Frontend/Mobile, auth, Q&A core, esquemas/indexes, migraciones
  ni dependencias. No agregar cambios a otros carriles en paralelo.
- Validación exact-head: API strict ESLint, TS, Prettier, related/full Jest,
  10 critical coverage, Quality Gate, runtime smoke y prod dependency audit.
- Los mocks validan la estructura; hace falta aceptación Mongo **específica**
  del nuevo agregado antes del release de B167.

Release #353 continúa **HOLD** hasta cero high/critical en auditoría de
producción (#133 node-forge, #141 braces, #492 follow-redirects),
resolución de aceptación y sin waivers. El PR queda Draft sin merge.
