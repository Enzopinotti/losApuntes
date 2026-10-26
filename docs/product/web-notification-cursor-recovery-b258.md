# B258 — Recuperación de cursores de Notificaciones Web

La bandeja de notificaciones detiene tanto la carga manual como la reconciliación periódica cuando encuentra un cursor actual o ya visitado. Conserva las notificaciones recibidas y deduplica por ID; los errores transitorios dejan disponible el cursor para reintentar. Cambiar de autoridad o recargar la primera página reinicia el historial.

## Validación

- Contrato Web Social/Q&A, con pruebas de cursor repetido, ciclos, fin de lista y deduplicación.
- TypeScript, ESLint focalizado y build de producción Web con manifiesto de release.
- Prettier en archivos de producto, higiene del repositorio y `git diff --check`.

La validación local no sustituye los checks automáticos de GitHub.

## Revisión de la reconciliación contra main

Se corrigió la sustitución del historial tras una reconciliación completa y
vigente. Antes del arreglo, Chromium reproducía una tercera notificación perdida
porque su cursor había sido recorrido en una cadena anterior. Ahora la carga
manual incorpora esa página y detecta el ciclo contra la cadena nueva.
Una segunda regresión comprueba que el fallo parcial de una reconciliación
conserva los datos y el historial previos. Se mantienen categorías, conteos,
filtro de no leídas y la única escritura explícita de marcar todas como leídas.

Chromium y el contrato Social Q&A pasan localmente. El build Vite pasa con
metadatos de despliegue unavailable. No se ejecutó ni reintentó CI.
