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

## Revisión tras reconciliar con main

Si falla una imagen, se conserva la inicial de respaldo. Una URL validada nueva
crea otra imagen para no heredar el estado oculto del intento anterior.
La regresión Chromium fallaba antes del arreglo y pasa después al refrescar
el mismo perfil desde su recuperación de paginación. Comprueba la inicial tras
fallo, la carga real de la URL nueva y la ausencia de avatar sin About público.
Mantiene el orden proyectado de tarjetas y enlaces externos de actividades.

Los contratos de URL/UI de avatar, perfil público, enlaces y orden pasan.
Prettier y build Vite pasan; metadatos de despliegue unavailable.
Sin ejecutar ni reintentar CI.
