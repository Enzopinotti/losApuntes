# B216 — enlaces en actividad pública de perfiles Web

## Problema

Las actividades del perfil aceptan una URL HTTPS y la respuesta pública la incluye, pero Web mostraba solo el título y la descripción.

## Comportamiento

- Una actividad con una URL HTTPS válida muestra un enlace externo con el dominio de destino.
- El enlace abre en otra pestaña, con `noopener noreferrer`, y conserva un indicador de foco visible.
- Direcciones malformadas, no HTTPS, con credenciales o mayores de 2048 caracteres no se muestran como enlaces.

## Alcance

Web vuelve a validar el campo `url` de cada actividad antes de construir el enlace. No cambia la autoridad de visibilidad del perfil ni realiza peticiones a la URL.

## Aceptación

- Solo HTTPS con host, sin usuario ni contraseña, y dentro del límite aparece como enlace.
- El dominio se anuncia al lector de pantalla para hacer explícito el destino.
- El contrato existente de perfil público y su paginación quedan intactos.
