# Mobile — búsqueda completa de apuntes guardados

**Bloque 17 — candidato integrado sin verificación.** Requisitos reutilizados:
`RES-FR-009`, `SEARCH-FR-002/006`, `MOB-FR-005/007/008`,
`NFR-SEC-001`, `NFR-PERF-001`, `CHG-003/006/007`.

## Problema y experiencia

Antes, la búsqueda local de Guardados examinaba únicamente las páginas ya
cargadas. Una coincidencia antigua podía no mostrarse aunque estuviese guardada.

Ahora la caja «Buscar en toda tu biblioteca» llama a
`GET /resources/saved/search?q=...` (título, descripción, etiquetas). El servidor
filtra sobre **todos** los saves de la cuenta antes de paginar y reautoriza
cada Resource. En Mobile:

- Texto normalizado (espacios), máximo 120 caracteres y mínimo 2 cuando hay
  búsqueda. Una entrada de 1 carácter pide completar; no envía consulta.
- Debounce de 300 ms; cada cambio aborta el request anterior y la vista descarta
  respuestas cuyo `searchQuery` no coincide con el input actual.
- `nextCursor` continúa la misma búsqueda, sin mezclar dos filtros, duplicar
  items o volver automáticamente al feed general.
- Empty con búsqueda no afirma que la biblioteca carezca de guardados.
- Falla de red/timeouts se muestra con retry; una respuesta anterior no se
  presenta como resultado de la consulta nueva.
- Salir del foco, cerrar sesión o cambiar de cuenta invalida operaciones.
- La selección de materia y orden por título siguen actuando sobre resultados
  **ya cargados**: los conteos y los textos no afirman que sean facets globales.
- Inicio conserva su preview de hasta tres guardados mediante
  `GET /resources/saved` sin `q`; su endpoint y cursor siguen compatibles.
- No se almacenan consultas, URLs firmadas ni datos privados en el dispositivo.

## Backend y riesgo operativo

La consulta arranca por saves del principal indexados por
`userId + createdAt + resourceId`, une Resources por ID canónico y verifica
moderación, visibilidad y grants antes de `$limit`. El servicio revalida una
vez más después del query para cierres/revocaciones concurrentes. La forma
de matching actual usa `searchText` existente, por lo que no requiere nueva
colección, migración ni un índice con información sensible.

**Límite:** aunque cada respuesta está limitada a 50, buscar texto sobre todos
los guardados del usuario puede recorrer muchos registros en un perfil de
alto volumen. Antes de un release público conviene medir explain/latencia
en datos representativos y evaluar índices/proyecciones sin duplicar autoridad.

## Aceptación pendiente (sin CI por solicitud)

| Caso | Criterio |
| --- | --- |
| Un match en una página histórica | Aparece en la primera página filtrada |
| Saves ocultos antes de matches | No consumen cupo de resultados visibles |
| Guardado compartido revocado | No se descubre aunque coincida el texto |
| Query con acentos y puntuación | Regex escapada; coincidencia de variantes |
| Cambio de query mientras carga | Abort y descarte de respuesta vieja |
| Paginación | `q` y cursor permanecen juntos |
| Cursor de otra cuenta/consulta | 422 seguro, sin lectura adicional |
| `q` ausente | Comportamiento previo de Home/Guardados conservado |
| Cierre de sesión/background | Limpieza de proyección y credenciales por autoridad |
| Sin resultados / sin red | Estados y caminos de recuperación diferenciados |

Se escribieron pruebas para cursor API, pipeline Mongo, reautorización y
controller/transporte Mobile. **No se ejecutaron** CI, tests, lint, typecheck,
build, smoke ni QA físico; el merge queda *integrado/no validado* y deberá
revisarse sobre el SHA exacto durante la consolidación general.
