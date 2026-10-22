# B210 — paginación de actividad en perfiles públicos de Mobile

## Problema

Los perfiles públicos en Mobile mostraban sólo la primera tanda de actividad y un texto que indicaba que había más, pero no ofrecían una forma de verla.

## Comportamiento

- Cuando el servidor habilita la sección de actividad, el perfil muestra los elementos iniciales y un control accesible para cargar la siguiente página.
- Mobile continúa `GET /profiles/:profileId/activities` con el cursor opaco y el límite devueltos por el perfil; conserva el orden del servidor y combina páginas por ID.
- Durante la consulta se deshabilita el control. Si falla, se conserva el contenido y el cursor para que la persona pueda reintentar.
- Las respuestas tardías se descartan al cambiar la cuenta, la sesión, el perfil o la autoridad activa de navegación.
- Una sección visible pero vacía explica que todavía no hay actividad pública. Si el servidor omite la sección, Mobile no expone su contenido ni una acción de paginación.

## Alcance

El cambio usa el endpoint público paginado existente y la autoridad de sesión de Mobile. No agrega rutas de backend, permisos ni almacenamiento local.

## Aceptación

- Se puede cargar cada página disponible sin duplicar actividades cuando hay elementos repetidos entre páginas.
- Un error mantiene la página actual y permite reintentar el mismo cursor.
- Cambiar de perfil o perder la autoridad cancela la consulta y evita mezclar actividad de perfiles o sesiones distintas.
- La sección vacía, la carga, el error y la acción de continuación tienen contenido accesible.
