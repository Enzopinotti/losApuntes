# B214 — avatar en el perfil público de Mobile

## Problema

La respuesta pública del perfil incluye el avatar cuando la sección de identidad está visible, pero Mobile no lo mostraba.

## Comportamiento

- El encabezado muestra el avatar autorizado junto al nombre.
- Sólo carga URLs HTTPS acotadas y sin usuario/contraseña.
- Si no hay URL válida o la imagen falla, muestra la inicial del nombre.
- La imagen es decorativa para accesibilidad: el nombre visible sigue siendo el texto del encabezado.

## Alcance

El cliente reutiliza exclusivamente `about.avatarUrl` del perfil devuelto por el servidor. No realiza búsquedas de identidad ni guarda imágenes o datos en almacenamiento local.

## Aceptación

- Una URL malformada, HTTP, `data:` o con credenciales nunca llega a `Image`.
- Los nombres con espacios iniciales y caracteres acentuados producen un fallback legible.
- Un error de carga conserva el nombre y la inicial como alternativa.
