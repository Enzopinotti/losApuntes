# B180 — Buscar y sumar material desde el Planificador

Estado: **candidato PR Draft**; no integrado ni desplegado.

## Valor para estudiantes

El Planificador de `/study/session` actualmente muestra páginas iniciales de apuntes guardados, apuntes disponibles y preguntas. El estudiante que prepara un parcial y necesita una pregunta o recurso puntual tenía que recorrer páginas o abandonar el plan para ubicarlo. B180 agrega un buscador temático directamente en «2. Sumá material de la materia».

Flujo nuevo: seleccionar **Apuntes** o **Preguntas**, buscar por texto (2–120 caracteres), opcionalmente filtrar preguntas **Abiertas / Cerradas / Todas**, abrir resultados o **Sumar al plan** en el momento, sin perder el borrador ni las otras fuentes.

El módulo usa exclusivamente los endpoints disponibles en `main`:
- `GET /resources?subjectId=&q=&cursor=&limit=25`.
- `GET /questions?subjectId=&q=&status=&cursor=&limit=15`.

Cada búsqueda requiere confirmación explícita; no se genera una consulta por tecla. Tiene paginación, deduplicación por identificador, error, reintento, vacío, foco y controles para pantallas táctiles.

## Seguridad y consistencia

- El `subjectId` viene de **Contextual Discovery autorizado**, no de un formulario libre ni de un ID extraído de una URL sin validación. El servicio se consulta siempre con ese subjectId y el resultado se filtra también en cliente.
- Antes de **Sumar**, se verifica nuevamente el ítem individual contra `resourcesApi.get` o `communityApi.question`; se compara el ID y la materia real. Una búsqueda pasada no garantiza acceso vigente.
- Se usa `useAsyncAuthorityFence` para búsqueda y para comprobación previa a agregar, ligado a sesión, materia y filtro. Cambios de sesión o filtro invalidan resultados/acciones asíncronas antiguas.
- No se almacenan resultados ni textos del servidor en `localStorage`, `sessionStorage` o IndexedDB. El plan se conserva con el modelo ya existente y sólo incluye IDs y campos elegidos por el usuario al exportarse.
- Las preguntas se agregan con **20 minutos**, los apuntes con **25 minutos**. Se respetan duplicados y el máximo de 24 tareas. Se refuerza también `appendTask` para rechazar sumas que superen **1.200 minutos**.
- No se modifica el backend, permisos, filtros de moderación, esquemas, dependencias, rutas ni exportación JSON/ICS/Markdown existente.

## Aceptación

1. Crear un plan para materia actual, buscar «integrales», sumar un apunte, constatar 25 minutos sin perder el título o notas previos.
2. Buscar preguntas sobre «integrales», filtrar Cerradas, sumar una respuesta discutida como tarea de 20 minutos. La etiqueta «cerrada» no equivale a respuesta correcta/aceptada.
3. Intentar agregar una referencia repetida, una tarea 25 al cupo de 24, y una tarea cuando quedan menos de sus minutos; se rechazan sin alterar el plan.
4. Buscar texto vacío, 1 caracter, 121 caracteres o caracteres de control; no se transforma en búsqueda global accidental.
5. Cambiar de materia, cuenta o sesión durante un request; no mostrar ni incorporar resultados anteriores.
6. Retirar el permiso sobre un apunte después de la búsqueda y antes de pulsar Sumar; su revalidación falla, sin confirmar la incorporación.
7. Página 2/3 conserva ítems distintos, sin duplicados; fallo de red conserva la lista cargada y permite reintentar.
8. Vista móvil, teclado y lectores de pantalla, sin peticiones por tecla.
9. La sección habitual de materiales paginados sigue disponible como alternativa.

## Verificación y release

`node scripts/test-web-study-plan-material-finder.mjs` valida reglas de búsqueda, origen de datos, aislamiento, reautorización y presupuesto del plan. `node scripts/test-web-study-session-integration.mjs` cubre el contrato anterior. La CI focalizada Node 24 incluye Types, ESLint, Prettier y build Web sobre SHA exacto. Antes de integrar se requiere aceptación con browser/API real.

El release #353 continúa **HOLD** por auditoría productiva #133 node-forge, #141 braces y follow-redirects #492 (parche independiente PR #495). Sin excepciones, dependencias nuevas, merge ni despliegue hasta cerrar gates.
