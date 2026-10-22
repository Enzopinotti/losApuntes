# B204 — Preguntas de una materia que necesitan ayuda

## Problema y comportamiento

Mobile permitía consultar todas las preguntas de una materia, pero no separar
las preguntas abiertas que aún no tienen respuestas visibles. B204 agrega un
carril de lectura dentro del recorrido de preguntas por materia, usando
`GET /qa/discovery/needs-help` y el `subjectId` canónico de la ruta existente.

El servidor excluye las preguntas propias, las cerradas y las no disponibles,
y determina la ausencia de respuesta visible directamente. Las preguntas se
ordenan desde las que llevan más tiempo esperando; esa antigüedad no representa
urgencia ni calidad. Abrir una tarjeta lleva al detalle existente, que vuelve a
validar el acceso y los permisos actuales para responder.

## Privacidad y límites

- La sesión validada aporta la cuenta; el cliente valida que la materia sea un
  UUIDv4 canónico y que cada tarjeta pertenezca a esa materia.
- Sólo se muestran ID de navegación, título y fecha de creación.
- No se muestran cuerpos, autores, respuestas, reportes ni métricas de personas.
- La paginación es por cursor, oldest-first y acotada a 15 elementos; los
  cursores vencidos permiten volver a la primera página.
- Se cancela y cerca una respuesta al cambiar sesión, contexto o materia.
- No añade API, persistencia, dependencias, permisos ni cambios de workflows.

## Validación local

- Pruebas de contrato del cliente: materia, proyección, orden, fechas, límites,
  cursor y sesión.
- Pruebas del controlador: paginación, orden entre páginas, autoridad,
  cancelación, cursores repetidos y reintentos.
- Prueba de navegación al carril y al detalle canónico.
