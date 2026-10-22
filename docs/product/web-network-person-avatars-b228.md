# Avatares en las personas de la red Web

Las filas de resultados de búsqueda, perfiles seguidos y conexiones muestran el
avatar público junto al nombre. Se reutiliza `PublicProfileAvatar` a tamaño
compacto, con inicial de respaldo y carga diferida. El componente conserva la
misma política de URL que los perfiles públicos: solo acepta HTTPS sin
credenciales y oculta una imagen que no carga.

El avatar es decorativo para tecnologías de asistencia; el nombre y sus
acciones siguen siendo el contenido accesible de cada fila. Los valores
proceden de las respuestas públicas de Search y Community.

La validación contractual se ejecuta con `pnpm test:web-network-presentation`.
