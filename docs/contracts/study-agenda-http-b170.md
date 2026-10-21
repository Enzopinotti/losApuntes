# B170 — Agenda privada de sesiones de estudio

## Objetivo

Reunir en una sola lectura las sesiones de estudio guardadas por la cuenta,
para que Web/Mobile puedan mostrar un calendario simple y una lista de
sesiones pendientes de programar. Complementa B157 (resumen de **una** materia)
y el reloj de foco de Web (PR #501), sin depender de esas ramas ni cambiar
el formato de las sesiones.

## GET /study-progress/me/agenda

- Requiere **`AuthSessionGuard` y `StudyProgressFeatureGuard`**.
  Cuando `STUDY_PROGRESS_ENABLED !== true`, mantiene el 503
  `STUDY_PROGRESS_NOT_ENABLED` existente.
- Identidad exclusiva `request.user.id`; sin `ownerUserId` seleccionable.
- `Cache-Control: private, no-store`.
- HTTP 200, lectura sin escritura ni efectos sobre la sesión.
- Incluye hasta **16 materias guardadas**, el límite de almacenamiento
  existente del módulo de progreso.

Respuesta ilustrativa (los arrays pueden estar vacíos):

```json
{
  "scheduled": [
    {
      "subjectId": "b14211d1-6f33-4e14-a946-000000000001",
      "revision": 3,
      "updatedAt": "2026-10-20T18:00:00.000Z",
      "title": "Preparar segundo parcial",
      "startsAt": "2026-10-21T21:30",
      "tasks": { "total": 2, "completed": 1, "pending": 1 },
      "minutes": { "planned": 75, "completed": 30, "remaining": 45 }
    }
  ],
  "unscheduled": []
}
```

`scheduled` incluye **todos** los planes cuyo `startsAt` es string,
se hayan completado o no. Se ordenan por `startsAt ASC` y desempate
`subjectId ASC`. `unscheduled` contiene planes con `startsAt=null`,
ordenados por `updatedAt DESC, subjectId ASC`.

## Fechas y zona horaria

El contrato `losapuntes.study-session` v1 conserva `startsAt` como
**fecha/hora local sin offset** `YYYY-MM-DDTHH:mm`. Esta API preserva
el valor del estudiante, **sin transformarlo a UTC ni a timestamp**.
Por esa limitación intencional, la API **no** infiere que una sesión
esté «atrasada», «en curso» o que deba notificarse hoy. La aplicación
debe mostrar el horario como **hora local guardada** y no trasladarla
silenciosamente entre zonas horarias/dispositivos.

`updatedAt` sí procede de MongoDB como fecha absoluta ISO UTC, utilizada
solo para ordenar las sesiones no programadas y mostrar su última edición.

## Derivados del plan

Cada entrada resume las `tasks` v1 persistidas, respetando los límites
actuales de 24 tareas y hasta 1.200 minutos:
- `tasks.total`: cantidad de tareas guardadas.
- `tasks.completed`: tareas con `done=true`.
- `tasks.pending=total-completed`.
- `minutes.planned`: suma de todos los `minutes`.
- `minutes.completed`: suma de tareas completadas.
- `minutes.remaining=planned-completed`.

Una sesión sin tareas devuelve ceros, no indica «completado».
Se muestra el título que el propio estudiante escribió, pero
**no** se publican notas, IDs de recursos/preguntas, enlaces privados,
estado de permisos ni contenido de tareas. El resultado no verifica
si los recursos o las preguntas guardadas siguen disponibles: eso
debe revalidarse al abrir una sesión.

## Seguridad y límites de rendimiento

El servicio realiza **una** consulta Mongoose
`StudyProgress.find({ownerUserId: sessionOwner})`, con proyección
explicita solo de `ownerUserId`, `subjectId`, `revision`,
`updatedAt`, `plan`, `limit(17)` y `maxTimeMS(5000)`.
Solo 16 documentos pueden salir válidamente; una fila 17 detecta
almacenamiento fuera del límite vigente. No hay N+1.

Aunque se lee el `plan` internamente para derivar conteos, el API
no lo serializa crudo. Reusa **`parseStudyProgressPlan`**, la
validación canonical v1 que ya se aplica al guardar. Verifica además:
dueño idéntico al de la sesión, UUIDv4 de materia, revisiones enteras
positivas, `updatedAt` válido, ausencia de materias duplicadas y
cantidad máxima de 16.

Si una fila guardada no es válida, la API devuelve **503**
`STUDY_AGENDA_DATA_UNAVAILABLE` sin emitir resultados parciales.
Si MongoDB falla se propaga el error del driver: no se sustituyen
errores por una agenda falsa vacía.

## Límites de entrega y aceptación

- Backend independiente `apps/api/src/study-agenda`.
- Suites Jest: autoridad de sesión, guard de feature flag, no-store,
  selección owner-first, límite 16+1, orden estable, horarios locales,
  conteos, privacidad de notas/IDs de tareas, duplicados, errores de
  integridad de filas/planes, caída de Mongo.
- No hay escrituras, migraciones, cambios de DB schemas/índices,
  Web/Mobile, auth, configuración del feature flag o lockfile.
- Tests mockeados de consulta **no son aceptación dedicada Mongo
  real**. Verificar integración en entorno compatible antes de
  producción, además de Quality Gate y smoke de runtime.
- Release #353 **HOLD** mientras haya advisories high/critical
  (#133, #141, #492), runner incompatible (PR #484) o acceptance
  pendiente. No se autorizan bypasses ni waivers de auditoría.
