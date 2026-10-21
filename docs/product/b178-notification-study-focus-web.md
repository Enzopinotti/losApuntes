# B178 — Separar actividad de estudio y actividad social en Notificaciones

Estado: **candidato Web (Draft), sin integrar ni desplegar**.

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

La suite existente `pnpm test:web-social-qa-contract` cubre las cinco clases conocidas, eventos desconocidos, separación de vistas, conteos de ventana, combinación con Solo no leídas, reset de sesión, paginación y ausencia de storage persistente.

Antes de dar Ready:
1. Una respuesta nueva se muestra en Preguntas y respuestas y conserva Abrir / marcar leída.
2. Una conexión aparece solamente en Actividad social.
3. Cambiar vistas no ejecuta requests adicionales; marcar leída sí los ejecuta de forma autenticada.
4. Solo no leídas se combina con las vistas; después del refresh la clasificación refleja `readAt` del servidor.
5. Si la primera página no contiene eventos del tema pero `nextCursor` existe, Cargar más sigue funcionando.
6. Cambio de cuenta/sesión no filtra datos de otro usuario ni conserva la vista anterior.
7. Revisión con teclado y pantalla angosta.
8. Exact-head Node 24: full `pnpm check`, Quality Gate, auditoría productiva, aceptación en navegador/API.

**Release:** #353 permanece HOLD. Las HIGH #133 node-forge, #141 braces y dos follow-redirects (#492; PR #495) no se ocultan ni se exceptúan en este bloque; no merge ni despliegue antes de cerrar gates.
