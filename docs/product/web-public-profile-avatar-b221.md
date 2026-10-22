# B221 — avatar en perfiles públicos Web

## Problema

La proyección pública del perfil ya incluye el avatar cuando la sección “Acerca de” es pública, pero Web solo mostraba nombre y biografía.

## Comportamiento

- La página muestra el avatar junto al nombre y la biografía cuando “Acerca de” es pública.
- Solo carga URLs HTTPS válidas, sin credenciales ni espacios exteriores, hasta 2048 caracteres.
- Si falta la imagen o falla la carga, conserva la inicial del nombre como fallback.
- El avatar es decorativo para accesibilidad; el nombre ya se presenta como encabezado.

## Aceptación

- Un avatar inseguro, ausente o roto nunca reemplaza el fallback.
- Un perfil que no publica la sección “Acerca de” no expone ni renderiza su avatar.
- La respuesta del servidor y las reglas de visibilidad permanecen como autoridad.
