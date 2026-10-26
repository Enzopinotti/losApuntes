# B225 — edición del avatar del perfil

## Problema

El avatar se mostraba en el perfil público y la API permitía actualizarlo, pero “Mi perfil” no ofrecía un campo para configurarlo.

## Comportamiento

- El formulario carga la URL guardada y permite reemplazarla o quitarla.
- El campo pide una URL HTTPS, aplica el límite de longitud del servidor y conserva la validación del API como autoridad.
- El avatar público sigue usando la política de URL segura y el fallback con inicial.

## Aceptación

- Guardar una URL actualiza el perfil; guardar el campo vacío envía `null` para quitarla.
- Recargar el formulario muestra el valor confirmado por el servidor.
- El campo tiene etiqueta accesible, validación de HTTPS y límite de 2048 caracteres.

## Revisión de integración

Se recortan los espacios externos al actualizar el campo, antes de la validación
nativa del navegador. Antes, una URL HTTPS pegada con espacios no llegaba al trim
del guardado; la regresión Chromium reproduce el fallo y pasa con la corrección.

El escenario comprueba hidratación de URL, rechazo de HTTP sin petición,
guardado de HTTPS con espacios recortados, rehidratación canónica y eliminación
mediante null con revisión vigente. Conserva presentación, orden y privacidad.
Los contratos de perfil/avatar y build Vite pasan localmente; el manifiesto
permanece unavailable. Sin ejecutar ni reintentar CI.
