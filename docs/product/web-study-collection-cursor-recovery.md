# Recuperación de paginación de Colecciones en Web

El listado de colecciones y los apuntes dentro de una colección mantienen
historiales de cursores separados por sesión y colección seleccionada. Si el
servidor devuelve el cursor solicitado o uno ya visitado, Web conserva y
deduplica la página recibida, oculta el cursor repetido y ofrece actualizar el
listado o la colección desde su primera página.

Los fallos transitorios de una página no consumen su cursor. En la lista, los
elementos anteriores y el siguiente cursor quedan disponibles para reintentar.
Si falla la actualización después de un ciclo, las páginas anteriores y la
acción de actualizar permanecen. En el detalle, las referencias y el cursor se
conservan después de un error de continuación; si falla la actualización tras
un ciclo, las referencias anteriores y su acción de actualizar permanecen.
`STUDY_COLLECTION_CURSOR_STALE` o una respuesta que indique que el acceso dejó
de existir descartan la cadena y exigen una lectura fresca.

Las dos rutas conservan sus límites y permisos actuales: las colecciones son
privadas del propietario y cada página de miembros vuelve a validar la revisión
de la colección. La recuperación solo vuelve a leer datos; no altera permisos,
referencias ni contenido de Recursos.

Regresión: `pnpm test:web-study-collections-cursor`.
