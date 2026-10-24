# B172 — Verificar referencias pendientes en un plan de estudio

## Objetivo

Un plan de estudio puede contener IDs de recursos y preguntas que, después
de guardarse, son eliminados, ocultados por moderación o dejan de estar
compartidos con el estudiante. El plan sigue siendo válido como borrador,
pero un cliente necesita saber cuáles de sus referencias **todavía puede
abrir** antes de comenzar una sesión.

B172 hace esa comprobación mediante los **mismos servicios de lectura
autorizada** que los endpoints originales (`ResourceService.get` y
`QaService.get`). No inspecciona únicamente campos de Mongo, porque ello
burlaría las reglas reales de permisos, compartición y visibilidad.

## GET /study-progress/:subjectId/reference-check

- Requiere `AuthSessionGuard` y `StudyProgressFeatureGuard`:
  `STUDY_PROGRESS_ENABLED=true`; no se inventa un nuevo feature flag.
- `subjectId` obligatorio, UUIDv4 validado por `ParseUUIDPipe`.
- Se lee el plan exclusivamente con
  `StudyProgress.findOne({ownerUserId:request.user.id,subjectId})`.
  No se acepta un ID de cuenta externo.
- Solo lectura, `Cache-Control: private, no-store`.
- No escribe, no inicia sesión de estudio, no altera
  tareas completadas ni incrementa contadores.
- Verifica únicamente las tareas con `done=false`.
  El orden de salida es el orden original dentro del plan.

Ejemplo de respuesta HTTP 200:

```json
{
  "subjectId": "b14211d1-6f33-4e14-a946-000000000001",
  "revision": 3,
  "checked": 2,
  "available": 1,
  "unavailable": 1,
  "items": [
    {
      "kind": "resource",
      "id": "269f2da7-f70c-418d-9151-000000000001",
      "status": "unavailable"
    },
    {
      "kind": "question",
      "id": "269f2da7-f70c-418d-9151-000000000002",
      "status": "available"
    }
  ]
}
```

`checked = available + unavailable = items.length`.
Con todas las tareas terminadas, `items:[]`, contadores cero.
Esto no significa que la sesión o la materia estuvieran vacías.

## Semántica y privacidad

Para cada tarea pendiente:

- `kind=resource` llama a `ResourceService.get(id,viewerUserId)`,
  **el servicio que aplica el mismo permiso de lectura** que
  `GET /resources/:id`, incluyendo visibilidad, moderación y permisos
  del archivo. Un recurso privado revocado no se declara disponible
  solo por existir en la base.
- `kind=question` llama a `QaService.get(id,viewerUserId)`,
  como `GET /questions/:id`, con el filtro de moderación vigente.
- Una lectura exitosa se transforma en `status=available`.
  Excepciones HTTP **403, 404 o 410** se transforman en el mismo
  `status=unavailable`. No se expone si fue un borrado, moderación
  o revocación de un permiso.
- Errores inesperados, 401, 422, 429 o HTTP 5xx se propagan:
  **nunca** se convierten en falsos resultados `unavailable`.
  El cliente debe distinguir un fallo del chequeo de un enlace
  que realmente está inaccesible.
- La respuesta no contiene títulos, cuerpos, nombres de autores,
  URLs firmadas, grants, contenido de archivos, notas ni permisos
  internos. Solo refleja la accesibilidad de IDs **que la cuenta ya
  guardó dentro de su propio plan**.

Una comprobación exitosa es una **observación temporal**. El acceso puede
revocarse antes de que el estudiante abra la referencia; el detalle
original siempre debe volver a validar el permiso. La pertenencia de
un recurso a la materia del plan no se verifica aquí, puesto que el
formato v1 acepta IDs opacos y no establece ese invariante.

## Validación, límites y fallos

La lectura del plan usa proyección de campos mínimos,
`findOne({ownerUserId,subjectId})` y `maxTimeMS(5000)`.
El plan guardado se valida con el parser canónico
`parseStudyProgressPlan`, que limita el total de tareas a 24,
la suma de minutos y la forma de todos los campos. Se valida además
el dueño, la materia y la revisión positiva.

- Si no existe un plan, HTTP 404 `STUDY_PROGRESS_NOT_FOUND`.
- Si una fila guardada está corrupta o pertenece a otra cuenta,
  HTTP 503 `STUDY_TASK_REFERENCES_DATA_UNAVAILABLE`.
- Se aceptan como máximo **24 verificaciones** por solicitud y se
  ejecutan en lotes de **máximo 4 concurrentes**. El siguiente lote
  empieza solamente después de resolver el anterior.
- Cada comprobación de lectura utiliza el servicio existente, por lo
  que puede realizar varias consultas internas. No se promete O(1)
  ni un tiempo máximo extremo a extremo.
- Un error en cualquier lote aborta toda la respuesta; no se emite
  un listado parcial engañoso.
- La lectura del plan y las verificaciones no están dentro de una
  snapshot/transacción: una edición concurrente puede hacer que el
  cliente reciba un `revision` que ya fue reemplazado. Debe volver
  a leer el plan antes de guardar modificaciones.

## Calidad, CI y release

- Servicio Nest `StudyTaskReferenceCheckService`, módulo y controlador
  aislados, con reutilización de `ResourcesModule` y `QaModule`
  existentes (ambos exportan sus servicios de lectura).
- Tests: session owner, UUID en ruta, feature flag, no-store, proyección
  segura, tareas terminadas omitidas, servicios reales como autoridad,
  distinción 403/404/410 vs 5xx, errores Mongo, validación fail-closed,
  orden y concurrencia máxima.
- Sin cambios en schemas/index, core Q&A/Resources/Study Progress,
  migraciones, auth, dependencias, Web, Mobile o lockfile.
- Gates esperados en SHA exacto: TS, strict ESLint, Prettier,
  related/full Jest, 10 critical coverages, Quality Gate, runtime
  smoke y auditoría productiva.
- La prueba de servicios con dobles Jest no es aceptación dedicada
  contra Mongo real ni prueba todos los estados de archivos y grants.
  Esta aceptación queda pendiente antes de un release.
- Release #353 **HOLD** mientras persistan high/critical de
  dependencias (#133, #141, #492), problemas de runner (#484)
  u otros criterios de aceptación. No se fusiona ni despliega
  el PR en esas condiciones.
