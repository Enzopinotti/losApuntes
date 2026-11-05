# B157 — Resumen de una sesión de estudio (HTTP v1)

**Ámbito:** exclusivamente backend NestJS. No se modifica Web ni Mobile. El B156 existente (#484) corresponde al carril CI/Mongo; B157 identifica esta funcionalidad para no duplicar bloques.

## Objetivo

Una sesión guardada ya contiene hasta 24 tareas (`resource` o `question`), los minutos estimados de cada una y `done`. La pantalla de materia necesita mostrar un progreso compacto y la próxima actividad sin descargar el plan completo ni exponer el texto de las notas.

## Endpoint

`GET /study-progress/:subjectId/summary`

- Requiere `AuthSessionGuard` **y** `StudyProgressFeatureGuard` sin modificaciones a `STUDY_PROGRESS_ENABLED`.
- `:subjectId` UUIDv4. La identidad es siempre la cuenta de `request.user.id`; ningún parámetro de propietario es aceptado.
- `Cache-Control: private, no-store`. Lectura exclusiva, sin cambio de revisión o tiempos.
- Base de datos: consulta exacta `findOne({ownerUserId,subjectId})` respaldada por índice único existente `{ownerUserId:1,subjectId:1}`. La proyección incluye solo los campos imprescindibles para calcular el resumen.

Ejemplo:

```json
{
  "subjectId": "11111111-1111-4111-8111-111111111111",
  "revision": 4,
  "updatedAt": "2026-10-20T12:03:00.000Z",
  "tasks": { "total": 3, "completed": 1, "pending": 2 },
  "minutes": { "planned": 70, "completed": 30, "remaining": 40 },
  "completionPercent": 33,
  "nextTask": {
    "kind": "question",
    "id": "33333333-3333-4333-8333-333333333333",
    "minutes": 25
  }
}
```

## Semántica

- `tasks.total`: cantidad de tareas guardadas; `completed`: `done=true`; `pending`: diferencia.
- `minutes.planned`: suma de `minutes` del plan, limitada por el contrato original a 1200; `completed`: suma de las tareas completas; `remaining`: diferencia. Son **estimaciones del estudiante**, no minutos medidos de actividad real.
- `completionPercent`: redondeo entero de `100*completed/total` por tareas, **no ponderado por minutos**. Un plan vacío devuelve 0, nunca 100.
- `nextTask`: primera tarea pendiente en el orden del plan guardado; `null` si no hay tareas pendientes. Su ID proviene del plan privado del propio estudiante y **no concede permisos** de lectura de Resource/Question ni garantiza que siga existiendo.
- `revision` y `updatedAt` permiten que el cliente sepa qué versión resumió y refresque luego de editar o borrar el plan.
- Nunca devuelve título, notas, fecha de inicio, lista completa de tareas ni IDs internos Mongo. El usuario puede seguir consultando/modificando su propio plan por los endpoints existentes.

## Seguridad y errores

- Sin autenticación: rechazo estándar de `AuthSessionGuard`. Feature flag deshabilitado: 503 estándar `STUDY_PROGRESS_NOT_ENABLED`.
- No hay sesión guardada para ese owner y subject: 404 `STUDY_PROGRESS_NOT_FOUND`, igual que `GET /study-progress/:subjectId`.
- Principal o UUID inválido al llegar al servicio: 422 `STUDY_SESSION_SUMMARY_INPUT_INVALID`. El controlador valida UUIDv4 en el borde.
- El registro persistido tiene dueño o materia incorrectos, revisión inválida, timestamp corrupto, o su plan no cumple el **parser canónico Study Session v1**: 503 `STUDY_SESSION_SUMMARY_DATA_INVALID`, sin exponer detalles de las notas del usuario.
- Fallos reales de Mongo: se propagan. No se convierten en resultados de cero ni en 404 sintéticos.

El cálculo se realiza con un máximo de 24 tareas, acotado por el validador existente. Se evalúa el plan almacenado para comprobar sus invariantes (format/version, materia, IDs, duraciones, unicidad, total) antes de devolver números derivados. No se agregan nuevas colecciones, índices ni migrations.

## Integración y aceptación

El frontend podrá construir el encabezado de progreso en la materia, barra porcentual, minutos restantes y botón de próxima tarea. Toda navegación al recurso/pregunta sigue requiriendo comprobar autorización en sus propias rutas. Esta entrega **no** agrega UI.

Tests cubren: sesión mixta, completa y vacía, orden de próxima tarea, privacidad, owner scoping, plan corrupto, revision/fecha inválida, 404, errores Mongo, route Auth/flag/UUID/no-store. CI exact-head: Jest, TypeScript, Prettier, ESLint estricto, 10 coberturas críticas, Quality Gate y auditoría productiva.

**Coordinación:** B143 (#469) modifica `study-progress.controller.ts` y `study-progress.service.ts` para el índice de materias. B157 no modifica esos archivos; solo registra sus componentes en `study-progress.module.ts`. B150/B152 modifican AppModule, que tampoco se toca aquí.

**Release HOLD:** issues de auditoría #133/#141 y release #353. Sin waivers, desactivación de CI, merge o despliegue hasta verificar gates completos.
