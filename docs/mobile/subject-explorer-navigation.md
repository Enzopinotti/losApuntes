# Bloque 28 — Explorar apuntes de una materia desde otras pantallas

**Fecha:** 14 de octubre de 2026  
**Branch:** `feat/mobile-subject-explorer-navigation-20261014`  
**Estado de QA:** código integrado por PR, pruebas escritas pero **no ejecutadas**.  
**Trazabilidad:** SEARCH-FR-002/006, MOB-FR-001/005/007/008, RES-FR-008/009, NFR-SEC-001.

## Problema de producto

Los bloques 25–27 ya conectan recientes, recursos guardados y preguntas de
materia. Sin embargo, «Seguí con esta materia» solo presenta apuntes abiertos
durante esta sesión y «Retomá tus guardados» solo presenta los guardados por el
usuario. Faltaba una transición directa desde esos contextos hacia **Buscar
apuntes accesibles de la misma materia**, incluidos los que nunca se abrieron
ni guardaron.

`MobileSearchApi.search` ya soporta consultas **solo por Subject ID**, sin
texto, limitadas a ocho recursos por solicitud. Por eso no se agrega un nuevo
endpoint, catálogo, modelo, índice, algoritmo de recomendación ni fuente de
permisos. Tampoco se vuelve a crear el feed de Inicio.

## Recorrido incorporado

- **Detalle de recurso autorizado:** en «Seguí con esta materia» aparece
  «Explorar otros apuntes de esta materia», al lado de las preguntas y
  apuntes recientes.
- **Inicio:** «Abiertos recientemente» ofrece «Explorar apuntes de mi
  materia» cuando existe una materia actual seleccionada y validada en la
  sesión académica.
- **Guardados:** cuando el estudiante selecciona una materia de sus facetas
  autorizadas, ofrece «Explorar más apuntes de esta materia». No se confunde
  la biblioteca propia con la búsqueda general.
- **Buscar:** cada grupo de «Recursos de tus materias actuales» añade
  «Explorar apuntes de esta materia» para pasar del resumen contextual
  (hasta cuatro por materia) a la consulta de recursos de la materia.
- **Destino común:** `/(tabs)/search?subjectId=<UUID-v4>`. La pantalla
  acepta un parámetro `subjectId`, lo valida antes de usarlo y aplica
  `subjectSelected` en el reducer existente: `scope=resources`, `q`
  vacío, filtro por Subject. La búsqueda autorizada se ejecuta usando el
  controlador existente cuando cuenta, foco, estado foreground y contexto
  académico coinciden.

## Seguridad, privacidad y estado

La navegación usa `subjectResourcesSearchAction` para generar una ruta con
**únicamente el ID canónico** de materia, sin título, nombre académico,
credenciales, IDs de sesión, metadata privada ni datos del recurso.
`subjectResourcesSearchRouteId` reutiliza la validación de UUIDv4 ya
existente para preguntas.

La URL entrante no concede acceso: Search sigue solicitando resultados al
servicio autenticado, aplica la autorización académica y de Resources, y
solo muestra las proyecciones que devuelve el servidor. Un parámetro
inválido se ignora y muestra un mensaje de enlace no válido, sin
reflejar su contenido. Las etiquetas del acceso se derivan de datos de
la pantalla autorizada que lo originó, pero no se transportan en la URL
como afirmación de identidad.

La selección entrante se consume una vez por combinación **sesión +
Subject**. Así la edición manual del texto, la eliminación del filtro o
el cambio de pestaña no reimponen continuamente el parámetro.
Al cambiar de usuario/sesión, la nueva consulta debe volver a pasar por
sus propios controles de autoridad. Los errores de red usan la recuperación
existente y nunca se presentan como resultados vacíos verificados.

## Límites honestos

- **Buscar devuelve hasta ocho resultados por tipo** mediante la API
  actual. «Explorar» significa ejecutar una búsqueda acotada a esa materia;
  **no** implica paginación exhaustiva del catálogo ni que se hayan
  encontrado todos sus apuntes.
- El descubrimiento contextual mantiene su límite actual de seis materias
  y cuatro recursos por materia.
- No cambia las reglas de publicación de preguntas, la selección de
  afiliación académica, los Guardados ni la política de lectura.
- Los parámetros son seleccionadores de navegación y no claves de
  autorización; la revocación posterior se vuelve a comprobar en detalle.
- La navegación a una materia ya presente en Buscar puede depender de
  la actualización de parámetros de Expo Router; verificar en QA nativa
  flujos de ida/vuelta, cambio de pestaña, deep link externo y teclado.
- No hay almacenamiento local nuevo ni seguimiento de actividad.

## Matriz de aceptación pendiente

| Escenario                                         | Esperado                                           |
| ------------------------------------------------- | -------------------------------------------------- |
| Abrir detalle autorizado y explorar               | Buscar con Subject seleccionado                    |
| Detalle no autorizado                             | No se monta panel ni CTA                           |
| Materia actual de Inicio                          | Navega con el Subject real, no ID de participación |
| Guardados filtrados por Subject                   | Acceso a búsqueda general de esa materia           |
| ContextualDiscovery con cuatro recursos           | Permite ejecutar búsqueda acotada de hasta ocho    |
| Subject con más de ocho recursos                  | No prometer resultados exhaustivos                 |
| UUIDv4 válido de enlace externo                   | Activa filtro de recursos sin texto                |
| UUID de otra versión / rutas / arrays / inyección | Rechazo y aviso sin consulta privilegiada          |
| Campo de texto editado tras navegar               | No se reimpone el filtro de la ruta                |
| Filtro limpiado manualmente                       | Regresa al estado de búsqueda original             |
| Cambio de Subject                                 | Nueva búsqueda con filtro nuevo                    |
| Cambio de sesión o contexto                       | Resultados anteriores se descartan                 |
| Cuenta sin contexto académico                     | Espera restauración/fence vigente                  |
| Error sin conexión                                | Mantiene error y reintento del buscador            |
| Preguntas de la materia                           | Rutas y permisos de publicación intactos           |
| TalkBack/VoiceOver                                | Acciones con etiquetas específicas y aviso válido  |
| Expo Router tab + deep link                       | Validar reentrada y parámetros en Android/iOS      |

## Calidad e integración

Se agregó `apps/mobile/test/search-subject-navigation.test.ts` con casos
de UUID canónico, parámetros inválidos, aislamiento de la URL, estado de
búsqueda solo por Subject, interacción manual, enlaces de cuatro puntos
de entrada y límite de ocho resultados. **Las pruebas no se ejecutaron.**

La rama debe fusionarse mediante PR con commits atómicos `[skip ci]`,
**merge commit sin squash**. No se ejecutan tests, CI, lint, typecheck,
builds, benchmarks ni QA nativa en esta fase; el estado sigue siendo
**INTEGRADO / NO VALIDADO** hasta el gate conjunto sobre SHA de `main`.

## B192 — Restablecer búsqueda completa sin ampliar resultados silenciosamente

**Requisitos existentes:** SEARCH-FR-001/004/006, MOB-FR-005/007/008, NFR-UX-001. El backend continúa autorizando búsqueda y contexto.

En la pestaña **Buscar**, la acción preexistente «Limpiar búsqueda» borra **sólo el texto** y puede conservar materia y tipo. Para dejarlo explícito se denomina «Limpiar texto». La nueva acción **«Restablecer búsqueda y filtros»** aparece cuando hay consulta escrita, alcance diferente de Todo o una materia seleccionada.

- Cancela el debounce y la solicitud HTTP anteriores mediante el controlador existente antes de cambiar el reducer.
- Restablece de forma atómica texto vacío, alcance Todo y materia nula, sin ejecutar una búsqueda global vacía ni reusar resultados antiguos.
- Si la pantalla llegó por el enlace de materia, reemplaza la ruta por \`/(tabs)/search\` sin \`subjectId\`; el filtro antiguo no se vuelve a imponer tras una recuperación de sesión.
- Mantiene la carga contextual autorizada, la sesión, los guardados y el flujo de preguntas sin cambios. No introduce persistencia, métricas ni permisos.

**Aceptación:** pruebas de reducer para texto solo, materia sola, combinación materia+texto, tipo sin texto, repetición idempotente y ausencia de consulta ejecutable después del reset; contrato estático de la UI y su cancelación. La validación final en dispositivo sigue siendo distinta de Jest/TypeScript.
