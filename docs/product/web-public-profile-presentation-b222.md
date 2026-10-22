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
