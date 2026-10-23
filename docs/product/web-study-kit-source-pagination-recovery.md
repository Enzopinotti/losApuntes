# Recuperación de fuentes paginadas en Study Kits Web

Los listados “Más guardados” y “Más apuntes” mantienen historiales de cursor
separados por sesión y materia. Si una respuesta repite el cursor solicitado o
uno de una página anterior, Web deduplica la página recibida, detiene solo ese
origen y ofrece actualizarlo desde la primera página.

Los errores transitorios conservan los resultados y el cursor para volver a
intentar. Una respuesta de sesión vencida o recurso no disponible limpia el
origen afectado. Actualizar las fuentes reinicia ambos historiales de forma
independiente.

El buscador de recursos dentro del kit tiene su propio scope y recuperación;
este cambio cubre únicamente las listas guardadas y encontradas por materia.

Regresión: `pnpm test:web-study-kit-sources-cursor`.

La prueba de Chromium `node scripts/test-web-study-kits-resource-search-browser.mjs`
también verifica que la fuente encontrada detenga un cursor repetido, conserve
los resultados ante un error 500 y los descarte ante 401, 403 o 404 de Recursos.
