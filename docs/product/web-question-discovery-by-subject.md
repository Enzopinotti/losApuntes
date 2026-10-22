# Descubrir preguntas por materia — Web 2026

## Necesidad del estudiante
Buscar una duda tiene que ocurrir dentro de la materia que el estudiante está cursando o explorando. Hasta este bloque la API pública `GET /questions` admitía `subjectId`, `status` y `q`, pero la página Web solo enviaba texto/estado en memoria; el filtro de materia existía únicamente al **crear** una pregunta.

## Nuevo recorrido
1. Desde **Preguntas y respuestas**, ingresar texto libre de 2 a 120 caracteres (o buscar sin texto), seleccionar estado **Todas, Abiertas o Cerradas**, y opcionalmente **Buscar materias** en el catálogo académico.
2. Seleccionar una materia y pulsar **Buscar** para aplicar simultáneamente el texto, estado y `subjectId` canónico a la API existente. La lista pública sigue paginada y el backend mantiene la autoridad de visibilidad.
3. La URL representa exclusivamente la selección enviada: `/questions?q=parcial&status=open&subjectId=<uuid-v4>`. Editar el borrador en el campo no dispara consultas ni modifica la URL. Recarga y Atrás/Adelante recuperan el estado.
4. **Copiar enlace de búsqueda** comparte texto, estado e ID canónico público. El botón advierte que el texto será visible en la URL; no copia identidad ni datos académicos privados.
5. Abrir una pregunta agrega `id=<uuid-v4>` sin eliminar filtros. **Volver a las preguntas** quita solo `id`. **Copiar enlace a esta pregunta** permite mandar directamente esa duda conservando el contexto de búsqueda.
6. Seguir abriendo los enlaces históricos `/questions?id=<id>` desde Notifications, feeds y otras partes del producto.
7. **Quitar filtro** o **Limpiar filtros** vuelve a una vista pública amplia por una acción explícita del estudiante.

## Seguridad y fiabilidad
- `q` válido o ausente, longitud 2–120, sin caracteres de control; `status` admite solo `open|closed`; `subjectId` UUID v4 canónico. Valores duplicados, malformados o de estado desconocido **no se transforman silenciosamente en una búsqueda global**.
- La búsqueda de materias del selector usa `resourcesApi.searchSubjects` con AbortSignal y fence por sesión/consulta. Las opciones y el término del selector se limpian al cambiar autoridad de la sesión. Un enlace por materia abierto sin catálogo contextual muestra «materia del enlace» sin inferir nombres privados.
- El listado del servidor está ligado a `status:userId:sessionId:q:status:subjectId`, y las respuestas antiguas no sustituyen una selección nueva.
- Los enlaces conservan únicamente campos públicos, sin tokens, cookies, datos de usuario ni resultados cacheados. Abrirlos no confiere acceso adicional.
- No se añaden endpoints, migraciones, dependencias, tracking ni persistencia local. Mantiene funciones de autoría, respuestas, reportes y moderación existentes.

## Pruebas y aceptación
El contrato automatizado `node scripts/test-web-question-discovery-contract.mjs` verifica serialización real UTF-8/reservados, roundtrip, UUID, filtros duplicados/invalidos, identidades separadas, ida y vuelta de detalle, compatibilidad con `?id`, backend `subjectId`, aislamiento y estados.

La CI exact-HEAD comprueba Prettier de los archivos cambiados, TypeScript Web y contrato. **Sin levantar servicios ni navegador**.

**Pendiente para fase de aceptación integral:** reproducir búsqueda anónima/autenticada, error 401, cambio de sesión y materia, URL duplicada/malformada, filtros Atrás/Adelante, copia fallida por permisos, lector de pantalla, responsive y permisos de pregunta/answer.
