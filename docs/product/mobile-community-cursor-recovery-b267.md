# Recuperación de cursores en preguntas y respuestas de Mobile (B267)

**Fecha:** 22 de octubre de 2026. **Base:** `main@e9050c00`. **Alcance:**
feed de preguntas de la comunidad y paginación de respuestas en Mobile.

## Problema

Las cargas manuales del feed y de respuestas confiaban en que el servidor
siempre avanzara el cursor. Si una página devolvía el cursor actual o uno ya
usado, el botón de continuar podía solicitar páginas repetidas sin límite.
Las reconciliaciones internas de Q&A ya detectaban ciclos, pero los recorridos
normales de pantalla no.

## Comportamiento

- Cada controlador recuerda los cursores solicitados durante la cadena activa.
- Tras una respuesta correcta, si el servidor devuelve un cursor ya solicitado,
  se conserva y deduplica el contenido recibido, se termina la paginación y se
  informa que hay que actualizar la lista o conversación.
- Un error de red conserva el cursor y los elementos actuales para permitir un
  reintento. Un cursor solo cuenta como consumido después de recibir una página
  correctamente.
- Actualizar el feed o la conversación inicia una cadena nueva; invalidar la
  autoridad limpia su historial.

## Validación

- `community-controller.test.ts`: ciclos A→B→A en preguntas y respuestas,
  retención de páginas y reintento de una página fallida.
- `tsc -p apps/mobile/tsconfig.json --pretty false`.
- Prettier para el controlador, la pantalla y las pruebas de Q&A.
