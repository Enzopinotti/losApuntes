# B173 — Exportación privada de sesiones de estudio al calendario (.ics)

## Objetivo

Los Apuntes permite guardar planes `losapuntes.study-session` v1 con
`startsAt` local y una lista de tareas. El B173 ofrece un archivo iCalendar
importable en aplicaciones de calendario, sin dependencia de servicios
externos, permisos OAuth ni almacenamiento de nuevos datos.

Este endpoint es **una descarga puntual**, no una suscripción de calendario:
importar el mismo archivo puede producir comportamientos distintos según el
cliente. La exportación no sincroniza cambios posteriores ni crea alarmas.

## GET /study-progress/me/calendar.ics

- `AuthSessionGuard` de sesión revocable y
  `StudyProgressFeatureGuard` existente (`STUDY_PROGRESS_ENABLED=true`).
- Identidad sólo desde `request.user.id`. No se admite seleccionar el plan
  o la cuenta de otro estudiante.
- Respuesta HTTP 200 con:
  - `Content-Type: text/calendar; charset=utf-8`
  - `Content-Disposition: attachment; filename="los-apuntes-sesiones.ics"`
  - `Cache-Control: private, no-store`
  - `X-Content-Type-Options: nosniff`
- No modifica los planes ni inicia sesiones de estudio.
- Si no hay sesiones programadas con duración, exporta un VCALENDAR válido
  sin eventos (no presenta la ausencia como error).
- Deshabilitado el feature flag: el 503
  `STUDY_PROGRESS_NOT_ENABLED` existente.

## Selección y duración

- Hasta **16 planes guardados** por estudiante: el límite de almacenamiento
  actual. Se verifican **todos**, incluso los que no se exportarán.
- Sólo genera `VEVENT` para planes con `startsAt != null` y al menos
  una tarea. Los planes sin horario y los planes sin tareas no generan eventos
  ni fechas/duraciones ficticias.
- `DURATION:PTnM` suma los minutos **planificados de todas las tareas**,
  incluyendo las ya completadas. No se presenta como tiempo real ejecutado
  ni como tiempo pendiente. La suma es entre 5 y 1200 minutos, conforme al
  validador canónico.
- Los planes completamente terminados permanecen en el archivo si están
  programados y tienen tareas: exportar no cambia su estado.
- Orden por `startsAt ASC`, desempate por `subjectId ASC`.

## Zona horaria — contrato deliberado

El formato `Study Session v1` almacena `startsAt` como
`YYYY-MM-DDTHH:mm` **sin offset ni zona horaria**. Se emite un
`DTSTART:YYYYMMDDTHHmm00` **floating** (sin `Z` ni `TZID`) siguiendo
RFC 5545. Esto significa que el evento se muestra en la hora local del
calendario donde se importe, no como un instante universal.

Ejemplo: `2026-11-03T09:30` se exporta como
`DTSTART:20261103T093000`, no como fecha UTC. El backend **no**
afirma que la hora equivalga a un huso ni ajusta horario de verano.
`DTSTAMP` y `LAST-MODIFIED`, que sí son instantes absolutos, se emiten
en UTC con sufijo `Z`.

**Importante:** si una persona importa el archivo en otra región o zona
horaria, las horas floating pueden ser interpretadas según la configuración
de ese calendario. Conviene comprobarlas antes de aceptar la importación.

## Privacidad y estructura del evento

Cada VEVENT incluye exclusivamente `UID, DTSTAMP, LAST-MODIFIED, SEQUENCE,
DTSTART, DURATION, SUMMARY`. El título (`SUMMARY`) es el que guardó
el estudiante. No se exportan notas, cuerpos de preguntas, IDs de tareas,
recursos, URLs firmadas, permisos, nombres de otras personas ni perfiles.

Los `UID` son hash SHA-256 hexadecimal del par cuenta/materia con
separador explícito y sufijo `@calendar.losapuntes.invalid`. Permiten que
el mismo calendario identifique eventos repetidos sin incluir los IDs
privados en claro. `SEQUENCE` es la revisión persistida del plan; el
mismo plan puede ser reemplazado o actualizado según soporte del importador.

El título pasa por el parser canónico `parseStudyProgressPlan` y se
escapan delimitadores RFC 5545 (barra invertida, coma, punto y coma y
saltos de línea). El archivo usa CRLF y pliega las líneas físicas a
**máximo 75 octetos UTF-8**, sin cortar caracteres multibyte. Se impide
inyectar un `VEVENT` desde un título.

La descarga exporta información privada **al dispositivo del usuario**.
Importar ese archivo en un calendario de terceros implica compartir allí
títulos y horarios; el usuario decide si lo hace.

## Persistencia y fail-closed

Una lectura `StudyProgress.find({ownerUserId:sessionOwner})` con
proyección owner, subjectId, revision, updatedAt y plan, `limit(17)` y
`maxTimeMS(5000)`. No se hacen llamadas N+1 ni consultas externas.

Se validan owner, UUIDv4 de materia, revisión positiva hasta 2^31-1,
fecha actualizada real, ausencia de materias duplicadas y todos los
planes mediante `parseStudyProgressPlan`. Una fila corrupta o más de
16 documentos provoca HTTP 503 `STUDY_CALENDAR_DATA_UNAVAILABLE`;
no se entrega un calendario parcial. Los errores Mongo se propagan.

El archivo no garantiza una snapshot de cambios concurrentes ni
revalida la disponibilidad actual de recursos/preguntas referenciados:
no incluye esas referencias.

## Tests, CI y release

- Jest renderer: delimitadores, CRLF, Unicode UTF-8, fold de 75 octetos,
  títulos con separadores, fecha floating, duración, UID estable por dueño,
  ausencia de datos de identidad y calendario vacío válido.
- Jest service: owner-only, `limit(17)`, selección de programadas,
  duración planificada, omisión de sesiones sin duración, planes terminados,
  integridad fail-closed, duplicados y errores Mongo.
- Jest controller: Auth Session, feature flag, headers de descarga y
  ausencia de selector de dueño.
- No hay cambios de schemas, índices, lockfile, dependencias, Web/Mobile,
  core Study, auth, permisos ni escrituras.
- Verificación local de la implementación: tres suites Jest enfocadas
  (23 pruebas), `check:types`, `lint`, `format:check` y `build` de API,
  además de `git diff --check`; todo pasa con Node 24 y pnpm 9.15.9.
- No se ejecutó CI. No se probó la lectura contra MongoDB real ni la
  importación interactiva en calendarios de terceros; esa interoperabilidad
  queda pendiente antes de anunciar compatibilidad con proveedores concretos.
- El HOLD de release #353 y la auditoría productiva (#133, #141, #492)
  siguen siendo controles de lanzamiento. La integración de este bloque
  no representa una aprobación de despliegue.
