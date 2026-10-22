# B174 — Descubrir preguntas por materia (Web)

## Problema y valor

El listado Web de Q&A consultaba el endpoint público `GET /questions` con texto y estado, pero no exponía el filtro `subjectId` que el backend ya soporta. Un estudiante que busca dudas de su materia debía recorrer preguntas de otras materias. Este bloque habilita la utilidad académica sin introducir un endpoint, ranking, consulta ilimitada ni autoridad duplicada.

Referencia funcional: **QA-FR-001** (materia académica canónica), **SEARCH-FR-004** (discovery contextual) y **PLAT-FR-005** (mismo contrato para clientes). Se trata de habilitar un filtro previamente soportado en el cliente; no cambia semántica ni persistencia. En la reconciliación documental posterior se debe registrar la disponibilidad Web B174.

## Comportamiento

1. En `/questions`, cualquier visitante puede buscar materia por nombre usando el catálogo académico existente, escoger una de las opciones devueltas y ver sólo las preguntas de esa materia.
2. `GET /questions?limit=25&subjectId=<uuid>` conserva el paginado por cursor, búsqueda por texto, filtro de estado y visibilidad/moderación autoritativa del backend.
3. Los enlaces de filtro tienen forma pública `/questions?subjectId=<uuid-v4>`. El usuario puede copiar el enlace; no contiene datos de sesión, email ni información privada.
4. Al abrir una pregunta desde un listado filtrado, `id` se agrega sin perder `subjectId`. Crear una pregunta desde el mismo listado tampoco pierde el filtro de materia.
5. El usuario puede filtrar directamente desde la materia mostrada en cualquier tarjeta. El botón **Ver todas las materias** limpia el filtro y el identificador de pregunta.
6. Un filtro ausente significa listado global; un filtro malformado o duplicado **no dispara un listado global**. La UI ofrece volver al listado o elegir otra materia.
7. Buscar materias, cargar Q&A y abrir un detalle son solicitudes separadas, cercadas contra respuestas tardías por cuenta, sesión y/o criterio. Cambiar cuenta no permite reutilizar resultados anteriores.
8. Abrir un enlace público no concede permisos: las preguntas y las materias disponibles siguen sometidas a autorización y moderación del backend.

## Casos de aceptación

- Anónimo busca por materia, filtra, abre una pregunta y vuelve usando la navegación del navegador.
- Usuario autenticado publica una pregunta y conserva el filtro de listado cuando abre el detalle resultante.
- Página filtrada con cero resultados muestra estado vacío, sin sustituirla por preguntas de otros temas.
- Cambiar materia durante una respuesta de red pendiente descarta la respuesta anterior.
- UUID inválido o parámetro duplicado no llama a `communityApi.questions`; limpiar filtro recupera la lista global.
- Copiar enlace omite `id`, búsqueda textual, credenciales y datos de identidad del usuario.
- La funcionalidad no usa almacenamiento local ni crea nuevos endpoints/flags.

## Verificación local — 2026-10-22

- `test:web-social-qa-contract`, Web TypeScript, ESLint, `format:check`, Prettier de SCSS y build de producción — PASS. El manifiesto de release informa `unavailable`; siguen las advertencias existentes de Sass y tamaño de bundle.
- `apps/api/src/qa/domain/qa.service.spec.ts` — 34/34, incluidos el filtro académico canónico y el cursor determinista.
- Chromium con Web local y respuestas API aisladas: UUID inválido no dispara listado; búsqueda y selección usan `subjectId`; copiar enlace contiene solo el UUID; abrir una pregunta conserva el filtro. Escritorio 1440 px y móvil 390 px sin desborde; el campo de materia móvil queda en 44 px.
- La inspección Web usó un stub local y bloqueó cualquier solicitud distinta de las GET necesarias. No se modificó API.

El smoke contra una instancia API/Mongo real permanece pendiente porque el daemon de Docker no respondió durante el intento de iniciar el runtime local. El contrato de servicio existente cubre la traducción del filtro y el cursor.

## Implementación y release

- Código: helper canónico de URLs, filtro por materia independiente del formulario de publicación, integración en Questions y CSS adaptable.
- Pruebas: el contrato obligatorio `scripts/test-web-social-qa-contract.mjs` verifica enlaces válidos, rechazo de parámetros malformados y duplicados, preservación de contexto, autenticación no duplicada y acceso al catálogo existente.
- El smoke local no certifica el comportamiento de una API/Mongo desplegada ni habilita la release.
- Este bloque no modifica endpoints, permisos ni workflows. No despeja la auditoría productiva #133/#141 ni el estado #353 HOLD; el merge del PR no autoriza un despliegue.
