# B171 — Próximas tareas de estudio, por materia

## Propósito y diferenciación

Los Apuntes ya almacena planes de estudio privados con hasta 24 tareas
por materia. B157 ofrece el próximo paso **de una sola materia** y B170
agrupa horarios y conteos. B171 reúne **una primera tarea pendiente de
cada materia** en una única cola, para que Inicio o Mobile ofrezcan
acciones concretas y no requieran una consulta individual por materia.

La cola no es una recomendación algorítmica, ni una evaluación, ni un
cálculo de urgencia. Respeta las prioridades que el estudiante colocó
manualmente dentro de cada sesión, y muestra las sesiones programadas
antes que las sesiones que todavía no tienen horario.

## GET /study-progress/me/next-actions

- Sesión revocable mediante `AuthSessionGuard`; `ownerUserId`
  procede **exclusivamente** de `request.user.id`.
- Se mantiene `StudyProgressFeatureGuard`: con
  `STUDY_PROGRESS_ENABLED !== true`, 503
  `STUDY_PROGRESS_NOT_ENABLED`.
- `Cache-Control: private, no-store`.
- Sin parámetros que permitan leer otra cuenta, escribir, modificar
  tareas, marcar completadas ni alterar las fechas guardadas.
- Respuesta 200, ejemplo ilustrativo:

```json
{
  "items": [
    {
      "subjectId": "b14211d1-6f33-4e14-a946-000000000001",
      "revision": 2,
      "title": "Repasar para el examen",
      "startsAtLocal": "2026-10-23T09:00",
      "updatedAt": "2026-10-21T11:00:00.000Z",
      "pendingTasks": 2,
      "remainingMinutes": 65,
      "nextTask": {
        "kind": "question",
        "id": "269f2da7-f70c-418d-9151-000000000002",
        "minutes": 45
      }
    }
  ],
  "summary": {
    "totalPlans": 3,
    "actionablePlans": 1,
    "completedPlans": 1,
    "emptyPlans": 1
  }
}
```

## Regla funcional

Para cada plan guardado se analiza `tasks` en el orden persistido:

1. Si la lista está vacía, la materia suma a `emptyPlans` y no
   se agrega una acción.
2. Si todas las tareas tienen `done=true`, suma a
   `completedPlans` y no se agrega una acción.
3. En caso contrario se elige **la primera** tarea no completada,
   proyectando exclusivamente `kind`, `id` y `minutes`. Las tareas
   restantes no salen del servidor.
4. `pendingTasks` cuenta todas las tareas con `done=false`;
   `remainingMinutes` suma sus minutos válidos (entre 5 y 120
   por tarea, hasta el límite canónico del plan).

`totalPlans=actionablePlans+completedPlans+emptyPlans`. Una materia
nunca aparece dos veces y `items` tiene máximo 16 entradas.

Orden:

- Primero planes `startsAtLocal != null`, por fecha/hora
  local `YYYY-MM-DDTHH:mm ASC` y `subjectId ASC` en empate.
- Después planes sin horario, por `updatedAt DESC` y
  `subjectId ASC` en empate.

La hora `startsAtLocal` es **texto local sin zona horaria**, conforme
al formato `losapuntes.study-session` v1. No se convierte a UTC,
no se interpreta como un instante, no se calcula atraso ni se crean
recordatorios sobre ella. `updatedAt` sí es ISO UTC de MongoDB.

## Privacidad y control de acceso

Se devuelve `title` porque pertenece al plan privado del usuario,
pero nunca se devuelven `notes`, otras tareas, cuerpos de preguntas,
nombres de otros usuarios, URLs privadas, tokens ni metadatos de permisos.

`nextTask.id` representa una **referencia guardada por el estudiante**,
no una garantía de que el recurso o la pregunta siga disponible: la
pantalla de detalle debe revalidar sus permisos, moderación y existencia
usando los endpoints de lectura originales. No permite saltar políticas
de acceso ni incrementa contadores de tareas.

## Persistencia, límites y errores

Una sola consulta Mongoose por
`StudyProgress.find({ownerUserId:sessionOwner})`, proyección explícita
de `ownerUserId`, `subjectId`, `revision`, `updatedAt`, `plan`,
`limit(17)` y `maxTimeMS(5000)`. El límite de **16 planes por cuenta**
es el del almacenamiento actual; una fila 17 es un error de integridad,
no un motivo para truncar silenciosamente.

Cada `plan` leído se valida contra el parser existente
`parseStudyProgressPlan` de Study Session v1, que verifica estructura,
materia, límites, tareas, IDs y contenido. También se validan owner,
UUIDv4 de `subjectId`, revisión positiva, `updatedAt` finito y
ausencia de materias duplicadas.

Si falla la validación de alguna fila, se rechaza **toda la respuesta**
con HTTP 503 `STUDY_NEXT_ACTIONS_DATA_UNAVAILABLE` (no se retorna
una cola parcial). Los errores del driver se propagan. No hay N+1
ni consultas a preguntas/recursos externos.

La cola puede quedar obsoleta al guardar o completar una tarea entre
requests; la API no ofrece snapshot transaccional ni garantiza acceso
vigente a referencias.

## Validación del carrier y límites de release

- Conserva los 11 commits atómicos de B171 sobre `main@29bd0ad` y
  agrega un commit independiente de evidencia/contrato; no se hace
  squash.
- 2 suites Jest: servicio y controlador+feature guard; cubren owner
  scoping, no-store, flag existente, orden, contadores y minutos,
  exclusión de tareas hechas, planes completos/vacíos, privacidad,
  límite 16+1, filas inválidas, duplicados y error Mongo.
- En el carrier: 2 suites / 20 pruebas, API TypeScript, ESLint API sin
  warnings, Prettier API, `nest build`, Prettier del contrato y
  `git diff --check` — PASS.
- No se ejecuta CI. Las pruebas de servicio usan mocks y **no
  sustituyen** aceptación de este endpoint contra MongoDB real.
- No cambia el modelo Mongo, permisos, autenticación, lockfile,
  migraciones, Web/Mobile ni otros módulos de estudio. No se habilita
  la feature ni se declara listo un release o despliegue.
- La integración del código conserva el HOLD de release #353 y los
  gates de auditoría/aceptación externa pendientes. No se añaden
  waivers ni se eluden controles.
