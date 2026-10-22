# B209 — estado de relación en perfiles públicos de Mobile

## Problema

En Mobile, el perfil público ofrecía acciones sin conocer la relación vigente. Podía invitar a seguir a alguien a quien la cuenta ya seguía y no mostraba si esa persona también seguía al usuario ni el estado de una conexión existente.

## Comportamiento

- El perfil consulta una vez el estado autenticado de seguimiento en ambos sentidos y de la conexión existente mediante `GET /social/profiles/:profileId/relationship`.
- Presenta por separado “seguís”, “te sigue” y el estado de conexión; permite seguir, dejar de seguir y solicitar una conexión desde el perfil.
- Si el perfil pertenece a la cuenta actual, explica que esas acciones no aplican y no las muestra.
- Mientras carga o si la lectura falla, no ofrece mutaciones con un estado supuesto. La pantalla deja reintentar una lectura fallida.
- Una solicitud tardía se descarta cuando cambia la cuenta, la sesión, el perfil, el foco de navegación o el estado activo de la app.

## Alcance y dependencia

El cliente reutiliza la autoridad de sesión y las rutas sociales existentes. La lectura nueva depende del endpoint B150 de la PR [#583](https://github.com/Enzopinotti/losApuntes/pull/583); esta rama está apilada sobre esa PR para que ambas piezas se revisen juntas. No agrega endpoints, permisos, almacenamiento local ni cambios de backend.

## Aceptación

- Un estado inicial muestra correctamente seguimiento mutuo, solicitud pendiente y conexión aceptada.
- No se habilitan acciones antes de cargar la relación ni cuando el perfil es propio.
- Dejar de seguir sólo cambia la interfaz al confirmarlo el servidor; si el resultado del DELETE es ambiguo, la pantalla vuelve a leer la relación antes de mostrar el resultado.
- Las respuestas de una autoridad anterior no reemplazan el estado del perfil o sesión actual.
- La pantalla no hace dos lecturas equivalentes al montar sus controles de conexión y seguimiento.
