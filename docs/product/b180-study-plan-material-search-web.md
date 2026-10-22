# B180 — Buscar y sumar material desde el Planificador

El bloque se trasladó a un carrier code-only sobre `origin/main` `23181b570f37dbe7dbff6ff4c902e04c8797a68f`. Se conservaron nueve commits funcionales, de prueba y documentación; se excluyó el commit que sólo agregaba un workflow. El ajuste final de dos aserciones ya estaba presente en `main`, por eso su cherry-pick resultó vacío. No se modifica `.github/workflows/` ni se lanzó CI manualmente.

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

Validación local del carrier:

- `pnpm test:web-study-plan-material-finder`: PASS; valida reglas de búsqueda, scope, reautorización y presupuesto. Quedó incluido en el `pnpm test` general.
- `pnpm test:web-study-plan-material-finder-browser`: PASS en Chromium a viewport móvil; con lecturas API simuladas en loopback cubre búsqueda de apunte/pregunta cerrada, nueva autorización al agregar, permiso revocado, preservación de notas/actividades y cero escrituras.
- `pnpm test:web-study-handoff-integration` y `node scripts/test-web-study-session-integration.mjs`: PASS; se conserva la regresión de B179.
- Web `check:types`, `lint`, `format:check` y `build`: PASS. El build muestra los avisos existentes de Sass y tamaño de chunk.
- No se ejecutó CI manualmente. La prueba de navegador usa API simulada, no un servicio desplegado.

El release #353 continúa **HOLD**: la auditoría local todavía reporta 2 HIGH (`node-forge`, `braces`) y 3 MODERATE; el advisory HIGH de `follow-redirects` dejó de aparecer tras el parche ya integrado. No hay excepciones ni autorización de release/deploy en este bloque.
