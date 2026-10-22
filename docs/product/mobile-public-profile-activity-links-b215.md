# B215 — enlaces en actividad pública de perfiles Mobile

## Problema

Las actividades del perfil aceptan un enlace HTTPS y lo incluyen en la proyección pública, pero Mobile solo mostraba el título, el tipo, las fechas y la descripción.

## Comportamiento

- Cada actividad con una URL HTTPS válida ofrece una acción para abrir el sitio externo.
- La acción anuncia el dominio y usa una etiqueta accesible que identifica su destino.
- Si el dispositivo no puede abrirlo, el perfil conserva sus datos y muestra un error junto a la actividad.
- Los esquemas distintos de HTTPS, URLs malformadas, credenciales embebidas y direcciones fuera del límite se descartan sin pasarlas al sistema.

## Alcance

Mobile vuelve a validar el campo `url` de cada actividad pública antes de invocar `Linking.openURL`. No realiza peticiones de red a la URL ni cambia la autoridad de visibilidad del perfil.

## Aceptación

- Solo enlaces HTTPS de hasta 2048 caracteres y sin credenciales ofrecen la acción.
- Un destino permitido abre el enlace mediante el API del sistema y una falla permanece local a esa actividad.
- No se altera el flujo de paginación ni la autoridad del controlador de actividad.
