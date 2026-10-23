# Mobile — compartir apuntes desde los feeds de Inicio

**Alcance:** MOB-037. Las filas de apuntes del Home académico, comunitario y **Para vos** ofrecen **Compartir enlace** junto a **Abrir apunte**. Preguntas y organizaciones conservan sus acciones actuales.

La acción sólo existe dentro de la proyección del Home autorizada para la sesión y contexto vigentes. Abrir y compartir son controles hermanos. El menú nativo recibe el título visible y `losapuntes:///resources/<uuid-v4>`; el detalle consulta de nuevo el recurso y la API verifica el acceso del destinatario. El enlace no lleva URL firmada ni concede permisos.

`apps/mobile/test/home-feed-resource-share.test.ts` verifica la autoridad de la proyección, la condición de tipo recurso y la separación de las acciones.

No cambia ranking, paginación, visibilidad, selección de contexto ni persistencia. La aceptación de menú y navegación en dispositivo sigue pendiente para iOS y Android.
