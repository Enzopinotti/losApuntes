# Bloque 21 — Guardados escalables y recuperación de paginación

**Fecha:** 2026-10-14. **Carrier:** `feat/saved-library-pagination-resilience-20261014`.  
**Trazabilidad:** RES-FR-009, SEARCH-FR-002/006, MOB-FR-005/007/008,
NFR-SEC-001, NFR-PERF-001.  
**Estado previo a calidad conjunta:** código candidato, NO validado.

## Qué cambia para estudiantes

La biblioteca Guardados deja de montar todas las filas descargadas dentro de
un `ScrollView` y reutiliza **`ProductSurface.flatList`**. Los controles de
materia, búsqueda y orden quedan en el encabezado; los recursos se presentan
en filas virtualizadas, con claves estables por ID y navegación original a
detalle/Q&A. Continúa existiendo **Cargar más** manual para que el usuario
controle los requests; no se agrega autopaginación ni descarga en segundo plano.

Al cambiar de usuario, materia, texto u orden se desplaza la lista al inicio
sin desmontar el campo de búsqueda. Las notificaciones de quitar guardados,
errores y el CTA de más páginas quedan en el pie de la lista.

La carga de la página siguiente tiene dos recuperaciones distintas:

- **Error transitorio** (sin red, timeout, servidor): conserva el cursor y
  los recursos existentes; el botón pasa a **Reintentar carga**. No se marca
  como consumido un cursor que falló, de modo que el reintento es legítimo.
- **Cursor inconsistente**: si el servidor repite un cursor ya consumido
  (inmediatamente o después de otras páginas), se conservan las filas nuevas
  autorizadas, se desactiva el cursor circular y aparece un mensaje específico
  con **Reiniciar listado**. No se ejecuta una sucesión infinita de solicitudes
  ni se anuncia un falso fin de guardados.

Cada nueva consulta, sesión o salida invalida la secuencia anterior. Las
respuestas tardías no pueden reinstalar los cursores o recursos previos.

## Límites de ejecución Mongo

Las agregaciones de búsqueda global y conteo de materias incluyen:

- **`allowDiskUse: true`** para evitar depender solo del límite de memoria
  del sort/group en bases grandes.
- **`maxTimeMS: 8_000`** como presupuesto máximo solicitado a Mongo.
- El timeout real del cliente Mobile sigue siendo 15 segundos; Mongo puede
  terminar antes o por otros motivos. Un error específico de límite de Mongo
  (código 50 / `MaxTimeMSExpired`) se traduce a HTTP 408 con código
  `RESOURCE_SAVED_QUERY_TIMEOUT`; Mobile lo muestra como timeout recuperable.
- Otros errores de almacenamiento no se convierten en una lista vacía ni se
  suprimen como resultados válidos.

Se mantiene la verificación de moderación, visibilidad y permisos **antes de
paginar**, el filtro de usuario desde el token y la reautorización del servicio
al proyectar cada recurso. Los cursores de título (v2) y fecha (v1) conservan
su contrato y sus restricciones. No se modifica el esquema, índices ni
`ResourceService`, para no pisar el carril Account Export.

**Advertencia de rendimiento:** permitir spill y fijar un timeout evita
algunos fallos de memoria y consultas indefinidas, pero NO garantiza latencia
constante ni elimina el costo de joins/ordenamiento. Quedan pendientes
`explain('executionStats')`, análisis de índices, carga representativa,
consumo de disco y revisión de pool/concurrencia.

## Matriz de aceptación (pendiente de ejecución)

| Caso | Resultado esperado |
| --- | --- |
| 500+ apuntes guardados | Filas virtualizadas, sin montar toda la lista |
| Cambio de búsqueda con teclado abierto | Campo conservado, lista vuelve arriba |
| Cambio de sesión/Subject/orden | Proyección y cursores previos invalidados |
| Recurso revocado durante búsqueda | Sin exposición ni read-back indebido |
| Cursor A → A | Se bloquea el ciclo y se ofrece reiniciar |
| Cursores A → B → A | Se bloquea sin otro request adicional |
| Página autorizada con duplicados | Dedupe por ID sin perder orden |
| Error offline en página 2 | Se conserva página 1 y puede reintentarse página 2 |
| Timeout del aggregate Mongo | HTTP 408 con código seguro, nunca éxito vacío |
| Error de DB distinto de timeout | Se propaga la falla, sin falsear vacío |
| Guardado eliminado mientras scroll | Estado/acción de la fila coherentes |
| TalkBack/VoiceOver | Labels de retry, reinicio y recuentos accesibles |
| Orden por título, texto y materia | Query y cursor siguen la combinación |

**Pruebas de regresión escritas pero no ejecutadas:** Mongo budget, mapper
de timeout, ciclo de paginación, reintentos, cambios de autoridad y wiring
de FlatList. No se ha ejecutado CI, tests, typecheck, lint, builds ni QA en
dispositivos. Se debe volver a revisar el SHA de `main` antes de declarar
**VALIDADO**.

**Proceso:** PR con commits atómicos y `[skip ci]`, merge commit sin squash,
estado **integrado / NO validado**.
