# B218 — orden de secciones en perfiles públicos Web

## Problema

El servidor ya entrega `presentation.sectionOrder` filtrado por visibilidad, pero Web mostraba todas las tarjetas en un orden fijo.

## Comportamiento

- Ordena las tarjetas públicas con la preferencia enviada por el servidor.
- Omite secciones sin proyección disponible, duplicadas o que no se muestran como tarjetas.
- Mantiene nombre, biografía y acciones del perfil en el encabezado; no ordena ni deduce datos privados.

## Alcance

El orden se aplica solo a las tarjetas de habilidades, aprendizaje, proyección profesional, trayectoria académica y actividades. La pantalla sigue usando exclusivamente la proyección pública aceptada.

## Aceptación

- Las tarjetas siguen el orden del servidor aunque se omitan secciones no proyectadas.
- El orden repetido no duplica tarjetas.
- La identidad y la biografía permanecen arriba del contenido.

## Revisión de integración

Las tarjetas se renderizan en el orden proyectado también en el DOM; no se usa
CSS order para alterar solo el orden visual. Las secciones omitidas por la
proyección no se renderizan aunque hubiera datos presentes en la respuesta.
Esto mantiene alineados el orden visual, la navegación y la lectura asistida.

La regresión Chromium fallaba antes de esta corrección y pasa después. Cubre
orden de encabezados, secciones omitidas, duplicados, orden vacío, cambio de
proyección, ancho móvil y atributos del enlace externo de actividades.
Los contratos de perfil público, enlaces y política de orden pasan. El build
Vite pasa con metadatos de despliegue unavailable. Sin ejecutar ni reintentar CI.
