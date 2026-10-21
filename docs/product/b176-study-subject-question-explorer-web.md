# B176 — Explorar preguntas de una materia desde Mesa de estudio

Estado: **candidate Draft; no merge, no despliegue**.

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

## Regresión y aceptación

El contrato existente `test:web-study-workbench` amplía casos de filtros inválidos, longitud, control chars, claves distintas por sesión/materia/filtro, integridad de llamadas `communityApi.questions`, ausencia de duplicación de request en Workbench y paso a práctica.

Comprobar antes de considerar Ready:

1. Usuario con materia actual ve preguntas abiertas por defecto.
2. Buscar palabra de 1 caracter se bloquea sin buscar todo inadvertidamente.
3. Buscar “integrales” devuelve solo la materia autorizada; cambiar a Cerradas obtiene otras discusiones según API.
4. Página 2 agrega elementos sin duplicados ni mezclar filtros.
5. Al cambiar materia y volver rápido, no se ven resultados previos ni drafts de otra materia.
6. Al cambiar sesión en la misma pestaña, no aparecen datos de la sesión anterior.
7. Pregunta retirada/no visible deja error o no aparece; no se inventan respuestas aceptadas.
8. Desde una pregunta, abrir discusión y Practicar se mantienen en la materia.
9. Navegación por teclado y viewport móvil, con error/red caída y reintento.

Gates: candidato exact-head Node 24, `pnpm test:web-study-workbench`, `pnpm check`, `pnpm audit --prod --audit-level high`, browser/API real. Release #353 HOLD no se relaja. Audits HIGH #133/#141 y follow-redirects #492 persisten en main hasta remediación segura.
