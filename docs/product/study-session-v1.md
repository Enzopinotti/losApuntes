# Bloque 41 — Planificador de sesiones de estudio

**Estado:** funcionalidad Web en candidato de PR; no equivale a release certificado.  
**Base:** Mesa de estudio `/study` incorporada en PR #322.

## Necesidad

Estudiar implica elegir un conjunto **acotado** de recursos y dudas académicas, organizar el esfuerzo y poder continuar fuera de la plataforma. No requiere ranking, streaks ni seguimiento de actividad forzado.

## Interfaz

Ruta autenticada `/study/session?subjectId=<UUIDv4>`, accesible desde cada materia de la Mesa. Usa exclusivamente materias **actuales** verificadas por `GET /discovery/contextual`, limitada a las primeras ocho que admite el contrato del backend. La selección malformada, duplicada o ausente de contexto no realiza consultas de recursos.

Fuentes con paginación independiente:

- `GET /resources/saved/search?subjectId=<id>&order=saved` — apuntes guardados.
- `GET /resources?subjectId=<id>` — otros recursos visibles al estudiante.
- `GET /questions?subjectId=<id>` — preguntas sobre la misma materia (abiertas o cerradas).

El usuario puede agregar 24 actividades como máximo, ordenarlas, ajustar duraciones, marcarlas como revisadas, escribir notas y asignar horario de inicio. El total máximo exportable es **1.200 minutos**.

## Archivos portables y formatos

- **JSON** versionado `losapuntes.study-session / 1`: identificador de materia, título/notas/horario definidos por el usuario y lista ordenada `{kind,id,minutes,done}`. No incorpora títulos de otros, perfiles, tokens, URLs de archivos ni links firmados. Tamaño de importación máximo 64 kB.
- **Markdown**: checklist legible para uso sin conexión; nombres de materiales obtenidos de una reconsulta actual al servidor justo antes de exportar.
- **iCalendar**: evento local con duración equivalente a la suma de las actividades, al menos una tarea e inicio fijado por el estudiante; `DTSTART/DTEND` UTC, `UID` aleatorio, líneas plegadas, escape del texto y `CRLF`.

Al importar un archivo JSON se valida estrictamente el esquema, Subject y los límites. Se revalidan los identificadores **uno a uno**, con concurrencia máxima de cuatro, mediante `GET /resources/:id` o `GET /questions/:id`; sólo se muestran nombres cuando hay acceso actual y pertenencia a la materia. Las referencias inaccesibles quedan sin títulos y pueden quitarse. Los fallos de red no se consideran revocación de permisos. La exportación MD/.ics vuelve a revalidar las referencias, y se bloquea si alguna no está accesible.

## Ciclo de vida y seguridad

- Borrador sólo en memoria React y scoped a `status,user,session,subject`. No `localStorage`, cookies propias, indexedDB ni nuevo Mongo. Recargar descarta lo no exportado.
- Cambiar de usuario/sesión/materia invalida respuestas asíncronas, borra la proyección visible y no permite que otro ámbito modifique el borrador.
- Descargar un archivo crea una **copia controlada por el estudiante**; la app no puede revocar archivos guardados fuera de sus servidores. Se recomienda no compartir planes con contenido personal.
- Exportación JSON contiene referencias, no acceso: ninguna importación otorga permiso para ver recurso o pregunta.
- No hay métricas públicas, recompensas por permanencia ni datos persistidos adicionales.

## Casos de aceptación

1. Ruta privada, sesión restaurándose y sin materias.
2. `subjectId` inválido, repetido, de otra materia o fuera de las ocho primeras.
3. Respuestas tardías tras cambio de sesión o materia.
4. Carga y paginación aislada de las tres fuentes.
5. Agregado idempotente en UI (no duplicados de tipo + UUID), reordenamiento y estados hechos.
6. Límite 24 y máximo total 1.200 min sin crash ni export indebido.
7. JSON round-trip (UTF-8, v1, sin metadatos de terceros).
8. Rechazo de JSON excesivo, versión futura, UUID inválido, fecha imposible, tarea duplicada, duración ilegal y campos inesperados.
9. Importación con IDs ajenos a Subject o inaccesibles sin mostrar título.
10. Interrupción de red durante revalidación: no se afirma éxito ni revocación.
11. MD/.ics revalidan antes de exportar y nunca filtran metadatos stale.
12. ICS abre en calendario y respeta zona horaria y duración.
13. Focus/teclado, responsive y estados de error legibles.
14. Build Web/typecheck/prettier, smoke real y E2E exact-head antes del release.

**Pruebas automatizables añadidas:** `node scripts/test-web-study-session-plan.mjs` y `node scripts/test-web-study-session-integration.mjs`. La ejecución en checkout real y el quality gate global quedan pendientes hasta que se realicen.
