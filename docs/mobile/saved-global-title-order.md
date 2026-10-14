# Bloque 20 — Ordenamiento global de Guardados por título

**Carrier:** `feat/saved-library-global-title-sort-20261014`  
**Estado hasta gate conjunto:** implementación integrada, **no validada**.  
**Requisitos:** RES-FR-009, SEARCH-FR-002/006, MOB-FR-005/007/008, NFR-SEC-001, NFR-PERF-001.

## Experiencia

En Guardados, «Guardado» sigue mostrando la fecha de guardado descendente.
Ahora «Título A–Z» consulta **toda la biblioteca accesible del actor** y
ordena desde Mongo antes del límite de página, no solo la primera página
descargada. Ambas opciones se combinan con la búsqueda global de título,
descripción y etiquetas y el filtro global por Subject.

La pantalla conserva hasta 25 recursos por página, permite «Cargar más» sin
mezclar modos, permite quitar un guardado y abrir recurso o Q&A, y reconsulta
desde el inicio al cambiar texto, materia u orden.

## Contrato y autoridad

- `GET /resources/saved` permanece intacto (fecha descendente, cursor
  histórico). Home y otros consumidores no reciben cambios involuntarios.
- `GET /resources/saved/search?order=title` admite navegar sin `q` ni
  `subjectId`. Es válida cualquier intersección adicional de filtros.
- `order=saved` mantiene el modo anterior del endpoint filtrado. El orden
  de fecha mantiene el cursor v1; el de título utiliza cursor v2.
- Cursor v2 codifica último título íntegro + UUID canónico y huella de
  actor, texto normalizado, Subject y modo título. No concede permisos.
  Reutilizar un cursor con otro orden, usuario, texto o materia falla
  con `RESOURCE_SAVED_SEARCH_CURSOR_INVALID` (422).
- Mongo parte únicamente de saves del actor, une Resources y grants y
  exige moderación/visibilidad **antes** del sort final y `$limit`.
  Ordena por título ascendente con colación `es`, intensidad 1
  (sin distinción de mayúsculas ni acentos), desempate por UUID ascendente.
- `ResourceService.get` vuelve a autorizar cada ítem proyectado para
  proteger ante una revocación entre consulta y respuesta.
- Se corrigió además la correlación de `$lookup` en el pipeline de
  facetas del bloque 19: las claves ahora comparan contra la variable
  `$$resourceId` y no contra el propio campo por error.

## Consistencia / performance

Keyset pagination evita offsets lineales, duplicaciones por empates de
títulos en páginas consecutivas y mantener todos los resultados en Mobile.
No obstante, el orden global requiere hacer joins y ordenar el conjunto
accesible del actor; **no se afirma un SLA ni escalabilidad ilimitada sin
mediciones reales de `explain` y latencia**.

Un título editado, permiso revocado o guardado eliminado entre peticiones
puede mover o hacer desaparecer un ítem; no existe un snapshot inmutable.
Los cursores son posiciones, no pruebas de acceso. No hay caché persistente,
índice nuevo, migración, sesión nueva, endpoint público ni tracking de lectura.

## Matriz de aceptación pendiente

| Escenario | Esperado |
| --- | --- |
| Primera página con títulos Z, siguientes con A | A aparece primero con «Título A–Z» |
| Títulos equivalentes por caso/acentos | UUID desempata de manera estable |
| Más de 25 resultados con A–Z | Cada página mantiene exactamente el orden global |
| Cambio A–Z ↔ Guardado | Invalida página, cursor y respuestas pendientes |
| Materia + texto + A–Z | Intersección en servidor y cursor ligado a los tres |
| Cursor v1 usado con A–Z | Rechazo 422 sin consultar colección |
| Cursor v2 con otro actor/Subject/texto | Rechazo 422 sin filtrar datos de terceros |
| Sin filtros y orden Guardado | GET legacy mantiene respuesta y cursor previos |
| Sin filtros y orden A–Z | GET /saved/search?order=title |
| Guardado revocado en medio del scroll | Revalidación y eliminación segura de respuesta |
| Facetas compartidas | Sólo cuentan shares realmente vinculados al resourceId |
| Sin red, background, cambio de sesión | No se reutilizan resultados de otro alcance |
| Bibliotecas extensas | Medir `explain`, tiempos, uso de memoria y páginas reales |
| TalkBack/VoiceOver | Radios informativos y foco coherente tras recarga |

**Pruebas añadidas/actualizadas, no ejecutadas:** cursor v2, DTO, servicio,
pipeline Mongo, facetas, transporte Mobile, controller, navegación y
regresiones heredadas de la biblioteca.

**Sin CI por política temporal:** no se ejecutaron tests, lint, typecheck,
builds, despliegue ni pruebas de dispositivos. El PR conserva commits
atómicos y se fusiona sin squash con `[skip ci]`; sólo el gate conjunto
sobre el SHA exacto de main podrá marcar este bloque como **VALIDADO**.
