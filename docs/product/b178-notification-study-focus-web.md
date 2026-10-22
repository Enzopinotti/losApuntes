# B178 — Separar actividad de estudio y actividad social en Notificaciones

Carrier code-only preparado sobre `origin/main` `d51d6b71c98876c5761d0cdcaf05a09cd2739833`; no modifica `.github/workflows/` ni fue desplegado. Se preservaron los seis commits funcionales, de pruebas y documentación del bloque original.

## Problema

La bandeja de Notificaciones mezclaba respuestas a preguntas, aceptación de respuestas, seguimientos y solicitudes de conexión en un único listado cronológico. Un estudiante que buscaba saber si le habían respondido una duda tenía que recorrer también toda la actividad social.

## Recorrido propuesto

En `/notifications` hay tres vistas sobre los resultados ya cargados:

- **Todas**: listado habitual.
- **Preguntas y respuestas**: `qa.question_answered` y `qa.answer_accepted`.
- **Actividad social**: `social.followed`, `social.connection_requested` y `social.connection_accepted`.

Se mantiene **Solo no leídas**, que sigue consultándose desde el backend y puede combinarse con la vista elegida. Cambiar de tema es inmediato y no genera peticiones adicionales; el servidor continúa decidiendo qué eventos puede ver el usuario y cuáles son no leídos. Los tres contadores se refieren solamente a las **páginas cargadas**, nunca representan el total de la cuenta.

Si una vista no tiene elementos en la ventana cargada pero hay más páginas, se ofrece seguir cargando la bandeja **sin ocultar la paginación** ni afirmar que ya no existen notificaciones del tema. Un evento desconocido se conserva en Todas, no se reclasifica como Social.

## Autoridad y privacidad

- Sin endpoints nuevos, cookies/tokens extra, base de datos, sincronización, cache local ni dependencia nueva.
- La clasificación se hace después de `GET /notifications`, no afecta ni altera permisos del backend ni modifica el contenido de los eventos.
- La selección se restablece a Todas cuando cambia la sesión/cuenta, junto a los demás datos en memoria de esa bandeja.
- `Marcar todas como leídas` mantiene **alcance global**: se aclara expresamente que afecta también eventos ocultos por el filtro visual. `Marcar leída` y la navegación tras confirmación siguen usando el endpoint y la autoridad previos, sin optimismo de confirmación.
- Los contadores corresponden a elementos del cliente ya cargados, no a métricas globales ni conteos de pendientes permanentes.

## Validaciones y aceptación

Validación local del carrier:

- `pnpm test:web-social-qa-contract`: PASS; cubre categorías conocidas y desconocidas, vistas, conteos por ventana, composición con Solo no leídas, reset de sesión, paginación y ausencia de storage persistente.
- `pnpm test:web-notification-categories-b178-browser`: PASS en Chromium con viewport móvil y API simulada en loopback; cubre conteos, filtro local sin peticiones/mutaciones, evento desconocido en Todas, paginación, filtro no leídas del servidor y el alcance global de Marcar todas como leídas.
- Web `check:types`, `lint`, `format:check` y `build`: PASS. No se ejecutó CI manualmente.

El browser test simula las lecturas y la mutación de notificaciones; no sustituye la aceptación contra un servicio API desplegado ni una revisión con lector de pantalla.

**Release:** #353 permanece HOLD. La auditoría productiva local sigue en 2 HIGH (`node-forge`, `braces`) y 3 MODERATE; el HIGH de `follow-redirects` dejó de aparecer tras el parche integrado. No se concedió waiver ni autorización de deploy.
