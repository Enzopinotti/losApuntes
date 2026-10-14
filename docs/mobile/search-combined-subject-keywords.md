# Bloque 29 — Búsqueda combinada por materia y palabras clave

**Fecha:** 2026-10-14  
**Rama:** `feat/search-combined-subject-text-recovery-20261014`  
**Estado:** implementación y pruebas escritas; **sin ejecución de CI, tests, typecheck ni QA nativa**.  
**Alcance:** Mobile Search sobre la API existente, sin backend nuevo.

## Problema

El bloque 28 permitió abrir Buscar con `subjectId` desde Inicio,
Guardados, el detalle de recursos y el descubrimiento contextual. El
reducer anterior respondía a `queryChanged` borrando siempre
`selectedSubject`: escribir «integrales» dentro de Análisis Matemático
pasaba silenciosamente a buscar «integrales» en todas las materias. No era
posible afinar ambos criterios de forma coherente.

## Funcionalidad implementada

- **Materia + texto:** mientras la búsqueda está en `scope=resources`,
  ingresar entre 2 y 120 caracteres conserva la materia y solicita
  `{scope:'resources', subjectId, q}` al servicio existente.
- **Materia sola:** con el texto vacío consulta
  `{scope:'resources', subjectId}`. Se conserva el recorrido del bloque 28.
- **Un carácter o solamente espacios:** no se ejecuta ninguna consulta.
  No se vuelve silenciosamente al resultado de materia sola ni se hace una
  búsqueda no autorizada; aparece una instrucción específica.
- **Limpiar solo texto:** restaura el listado de la misma materia sin
  palabras clave. **Quitar solo materia:** conserva un texto significativo
  y lo busca entre todos los recursos. Si no había texto, vuelve al estado
  general original.
- **Cambiar el alcance a Todo/Materias/Personas:** es un acto explícito
  de ampliación; conserva texto pero elimina el filtro por materia.
  Seleccionar otra materia inicia la búsqueda de esa materia sin la
  consulta previa.
- **Sin resultados combinados:** muestra un mensaje contextual y dos
  recuperaciones independientes: «Buscar texto en todas las materias» y
  «Ver materia sin texto». En el caso sin palabras clave se permite quitar
  el filtro académico.
- **Respuesta vieja protegida:** el snapshot del controlador incluye el
  `subjectId` de la consulta. La pantalla compara `q`, `scope`,
  `subjectId` y autoridad actuales antes de renderizar un resultado,
  incluso durante el breve intervalo entre editar y ejecutar el efecto
  que cancela la petición anterior.
- La URL de navegación del bloque 28 continúa conteniendo **solo UUIDv4
  de materia**. El control de permisos sigue estando en Search API,
  no en el reducer ni en el deep link.

## API, privacidad y límites

No cambian endpoints, contratos de servidor, permisos, colecciones,
índices, modelos, cachés ni URL de navegación. Las respuestas se siguen
limitando a **ocho resultados por tipo**, que no son un catálogo exhaustivo.
El backend valida el principal y la disponibilidad de cada resultado; el
detalle también revalida la lectura.

La selección de `subjectId` es un filtro, no un permiso de inscripción
académica ni una facultad para publicar preguntas. No se guarda el texto ni
la materia en almacenamiento local persistente o analytics.

## Matriz de aceptación pendiente

| Caso | Resultado esperado |
| --- | --- |
| Abrir Análisis desde Guardados | Buscar por Subject sin texto |
| Escribir «integrales» | Mantener Subject y agregar `q=integrales` |
| Escribir un carácter | No efectuar request hasta completar 2 |
| Ingresar solo espacios | No interpretar como ausencia de filtro |
| Limpiar texto de búsqueda | Conservar Subject, volver a materia sola |
| Quitar filtro de materia con texto | Conservar texto, ampliar a todos los recursos |
| Quitar filtro de materia sin texto | Volver al estado general |
| Cambiar a «Todo» | Conservar texto, borrar Subject |
| Elegir otra materia | Reemplazar Subject y limpiar texto viejo |
| Resultados combinados vacíos | Mostrar las dos recuperaciones |
| Cambiar materia con request pendiente | Abort, fence de generación y no pintar respuesta vieja |
| Sesión o contexto académico cambiado | No mostrar proyecciones ajenas |
| Retornar desde otra pestaña | Mantener filtros manuales sin reimponer el enlace |
| Deep link inválido | Error seguro, sin utilizarlo para obtener permisos |
| Restricción de resultados | Hasta ocho por tipo, mensaje no exhaustivo |
| Android/iOS | Verificar foco, teclado, accesibilidad, tab y back |

## Regresiones escritas, sin ejecución

`apps/mobile/test/search-combined-subject-text.test.ts` incluye doce
escenarios del reducer, constructor de requests, cancelación y cableado.
Se actualizan tests preexistentes de `search-input-state`,
`search-controller` y `search-subject-navigation`, que antes asumían
que escribir quitaba siempre la materia.

**Pendiente en QA conjunta:** ejecutar las suites Mobile, revisar
TypeScript, las respuestas de API, los deep links reales de Expo Router y
la latencia/UX en Android/iOS. No declarar **VALIDADO** por el solo merge.

**Integración acordada:** commits atómicos con `[skip ci]` en PR
independiente; merge commit sin squash, sin disparar CI.
