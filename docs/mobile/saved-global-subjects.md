# Mobile — Guardados con filtros globales por materia (bloque 19)

**Estado:** funcionalidad implementada en rama, sin CI ni validación nativa.  
**Trazabilidad:** RES-FR-009, SEARCH-FR-002/006, ACAD-FR-006, MOB-FR-005/007/008, NFR-SEC-001, NFR-PERF-001.

## Nuevo recorrido

El estudiante entra en **Guardados**, donde las materias aparecen desde
`GET /resources/saved/subjects` sin depender de las 25 filas cargadas.
Puede elegir «Todas las materias», una materia específica, buscar por
título/descripcion/etiquetas, o combinar materia + texto.

`GET /resources/saved/search?q=&subjectId=&cursor=` aplica los filtros
antes de paginar, tomando la cuenta del token de sesión. Los cursores atan
usuario, texto normalizado y Subject; no se pueden reutilizar para otro filtro
ni mezclar con el listado sin filtrar.

La UI cancela consultas anteriores al cambiar texto o materia, y descarta
respuestas cuyo usuario, query o Subject no coinciden con el estado actual.
El botón «Cargar más» continúa los filtros de la primera página, incluyendo
materias sin apuntes presentes en el primer lote sin filtrar.

Las facetas tienen un ciclo de carga/fallo/reintento propio. El texto aclara
que los conteos son de guardados **accesibles en toda la biblioteca**, sin
aplicar la búsqueda de texto. Los nombres los resuelve Academic Graph.
**Actualización bloque 20:** «Título A–Z» se calcula globalmente en el servidor
con paginación por clave (título + ID), conservando filtros por materia y texto.

## Seguridad y límites

- Las relaciones de guardado no confieren acceso: la agregación excluye
  Resources moderados y no accesibles **antes** del conteo/filtro.
- La proyección vuelve a utilizar `ResourceService.get`; no crea otra
  política de autorización.
- El endpoint de facetas no recibe un user ID: siempre usa el principal
  autenticado. Las respuestas llevan `private, no-store` y no se persisten
  en caché local.
- No toca Account Export, ni añade tablas, índices, migraciones o eventos.
- Facetas acotadas a 100 Subject IDs. Si hay más, `truncated=true` y el
  selector advierte expresamente que es parcial, sin afirmar completitud.
- Actualización eventual: cambios de privacidad y desguardados pueden alterar
  el conteo o la siguiente página, sin garantizar snapshots inmutables.

## Matriz de aceptación pendiente

| Escenario | Esperado |
| --- | --- |
| Materia con guardados solo en páginas viejas | Elegible en selector global |
| Materia sin texto | Primera página con guardados de esa materia |
| Materia + texto | Intersección del filtro, sin mezcla de cursores |
| Cambio de materia durante una solicitud | Cancelación y descarte de respuesta vieja |
| Cambio de usuario, background o salida de la pantalla | Borrado de facetas y filas de la autoridad anterior |
| Recursos eliminados, ocultos o shares revocados | No cuentan como faceta visible ni aparecen en resultados |
| Facetas indisponibles | Error y reintento, sin afirmar biblioteca vacía |
| Más de 100 materias | Advertencia de selector incompleto |
| De vuelta a «Todas» con texto vacío | Listado histórico `/resources/saved` |
| Paginación de una materia sin coincidencias visibles | Continuación sin filtrar falsamente en el cliente |
| VoiceOver/TalkBack | Roles radio, nombres y conteos legibles |

**Pruebas escritas, no ejecutadas:** backend DTO/controller/service, cursor,
Mongo joins + ACL, transporte y controller Mobile. Validación integral sobre
SHA concreto de `main` y aceptación Android/iOS pendientes.

**Política de integración:** merge con commits atómicos, sin squash y con
`[skip ci]` equivale a **integrado / NO validado**.
