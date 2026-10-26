# B222 — apariencia de perfiles públicos Web

## Problema

La API ya devuelve los presets visuales permitidos para cada perfil público, pero Web siempre renderizaba el mismo acento y portada.

## Comportamiento

- La página aplica los presets de acento y portada de la proyección del servidor.
- La interfaz solo acepta los valores del catálogo cerrado; valores desconocidos vuelven al acento predeterminado y portada neutra.
- Los estilos no usan HTML ni CSS recibidos como contenido del perfil.

## Aceptación

- Los seis acentos y las cuatro portadas admitidas producen los atributos visuales esperados.
- Valores inesperados no se convierten en clases ni estilos arbitrarios.
- No cambia la visibilidad ni el orden de las secciones del perfil.

## Revisión tras reconciliar con main

La reconciliación conserva el orden real de tarjetas en el DOM, la recuperación
del avatar por cambio de URL y los scripts actuales de paginación y perfil.
El escenario Chromium existente comprueba data-accent/data-cover y los estilos
calculados para paper/campus, además del fallback default/none ante valores
fuera de las listas permitidas. Conserva las pruebas de orden, enlaces y avatar.

El escenario, los contratos de perfil público y el build Vite pasan localmente.
Los metadatos de despliegue permanecen unavailable. Sin ejecutar ni reintentar CI.
