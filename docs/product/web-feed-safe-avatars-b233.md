# Avatares seguros en el feed Web

Las tarjetas del feed reutilizan `PublicProfileAvatar` para mostrar autores
personales y organizaciones. El feed mantiene el tamaño de 44 px y su color de
respaldo; la política común solo carga HTTPS válido, oculta imágenes fallidas y
conserva la inicial.

La verificación contractual corre dentro de `pnpm test:web-feeds-contract`.

## Revisión de integración

Chromium comprueba tamaño de 44 px en el feed, carga de HTTPS permitido,
rechazo de HTTP sin petición y respaldo de inicial tras fallo de imagen.
Se mantienen los casos de ocultar, deshacer, restaurar, cambiar de feed y cerrar
sesión sin escrituras. El escenario de Red también pasa con los tamaños comunes.
Se actualizó su contrato de cableado a la tabla de clases del componente.

Contratos de feeds/Red, Prettier y build Vite aprobados; metadatos de despliegue
unavailable. Sin ejecutar ni reintentar CI.
