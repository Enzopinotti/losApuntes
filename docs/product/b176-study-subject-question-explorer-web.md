# B176 — Explorar preguntas de una materia desde Mesa de estudio

## Problema

La Mesa de estudio mostraba solamente una página de preguntas abiertas, sin búsqueda contextual ni acceso a discusiones cerradas. Un estudiante que estudia un tema concreto necesitaba explorar manualmente el foro general, aunque el backend ya permitía `q`, `subjectId` y `status` en `GET /questions`.

## Alcance implementado

- Reemplaza el panel abierto fijo por **Preguntas de la materia** sin mover las otras secciones de Guardados y Apuntes.
- Filtro por palabras del título o contenido y por estado **Abiertas / Cerradas / Todas**. El estado por defecto sigue siendo Abiertas; no se confunde “cerrada” con “respuesta aceptada”.
- **Buscar preguntas** aplica los filtros explícitamente; editar un campo no dispara requests en cada tecla. Longitud de búsqueda: vacío o 2–120 caracteres como exige el DTO del API.
- **Restablecer** devuelve preguntas abiertas sin palabras clave.
- Cada resultado permite abrir la discusión o practicar esa pregunta usando el vínculo seguro de la materia seleccionada.
- Paginación de 15 elementos, deduplicación por ID, actualización y reintento manual después de error.
- Estados accesibles de carga, vacío, resultado y error con mensajes en castellano, etiquetas explícitas y foco visible.
- Conserva `subjectId` **autorizado por Contextual Discovery** en toda consulta. No asume que un usuario cursa una materia por conocer su UUID.

## Arquitectura, privacidad y límites

El componente `StudySubjectQuestions` aísla los requests del panel. Se monta con clave de cuenta/sesión y materia; cada filtro comprometido define además una clave de autoridad asíncrona distinta, impidiendo mostrar respuestas viejas después de cambiar filtro, sesión o materia. El draft del formulario también tiene scope local. Las llamadas siempre incorporan la materia activa y un `AbortSignal` del fence.

No se modifica API, MongoDB, endpoints, DTO, permisos, roles, dependencias ni la pantalla general `/questions` del B174. No hay persistencia de consultas en localStorage/IndexedDB ni generación automática de resúmenes de Q&A.

Las cantidades mostradas representan resultados cargados, no métricas globales. El filtro de estado no elude moderación ni visibilidad del backend.

## Regresión y aceptación local

El contrato
`node scripts/test-web-study-workbench.mjs` cubre filtros inválidos, longitud,
caracteres de control, claves distintas por sesión/materia/filtro, llamadas
`communityApi.questions`, ausencia de fetch duplicado desde Workbench y vínculo
de práctica.

La prueba
`node scripts/test-web-study-workbench-b176-browser.mjs` ejecuta Chromium real
con Vite y una API simulada en viewport móvil. Verifica preguntas abiertas por
defecto, validación de una letra sin búsqueda global, búsqueda sólo al pulsar,
filtros Cerradas/Todas, paginación con deduplicación, que filtrar no recargue
Guardados y que materia/sesión aíslen el estado.

La aceptación usa respuestas simuladas y no valida moderación ni visibilidad
contra un servidor real. Conviene comprobar esos límites con la API de staging
antes de anunciar compatibilidad productiva.

## Validación local y release

Con Node 24 y pnpm 9.15.9 pasan los dos scripts anteriores, TypeScript Web,
ESLint Web sin warnings, Prettier Web, build Web y `git diff --check`. No se
ejecutó CI ni se modificaron workflows.

La auditoría productiva aún reporta 2 HIGH y 3 MODERATE en el baseline; el
release #353 permanece HOLD. La integración de este bloque en `main` no
representa una aprobación de despliegue.
