# B183 — Apartar elementos de la tanda de Inicio, sin seguimiento

**Fecha:** 21 de octubre de 2026. **Base exacta:** `main@6bd965c71f6426da3d49fc7c0555e0e5afda06a9`. **Alcance:** preview Web autenticada del inicio `/`. No toca los feeds completos.

## Necesidad

Inicio ofrece una tanda finita y contextual. Un estudiante puede querer apartar por ahora una pregunta o recurso que no le interesa, sin generar señales permanentes ni alterar el algoritmo. B183 propone una acción local reversible, distinta de moderación, reportes, bloqueos o las preferencias persistentes del Feed.

## Recorrido

1. El usuario autenticado ve su tanda contextual o «Para vos». Cada tarjeta tiene el botón **Apartar por ahora**.
2. Al pulsarlo, la tarjeta se oculta **solo en esa tanda y pestaña**. El backend no recibe un evento ni se modifica la prioridad del recurso, su visibilidad o el acceso.
3. Aparece un aviso claro «Apartaste N de esta tanda. No cambia tus preferencias ni reporta el contenido» y botones **Deshacer último** y **Mostrar todo**.
4. Si apartó todos los elementos, el diseño presenta «Apartaste todos los elementos de esta tanda», **no** el estado «No hay contenido» que significaría una respuesta vacía del backend. Se puede restaurar todo.
5. Pasar entre «Mis materias» y «Para vos» crea una vista nueva, sin compartir estado de ocultamiento. Al recargar, cerrar la pestaña o cambiar de sesión/cuenta, vuelve la tanda original si el servidor aún la ofrece.
6. El enlace para visitar el feed completo permanece. Los recursos siguen accesibles mediante búsqueda y rutas directas si la autorización y moderación del servidor lo permiten.

## Invariantes técnicos

- `home-feed-momentary-hide.mjs`: identifica los elementos por `type:id`, evitando colisiones entre recurso, pregunta y publicación de organización; solo admite identidades con tipo/ID coherentes.
- El estado oculto no supera el máximo acotado de la tanda (16) y **no** puede aceptar un elemento ajeno al preview actual. No altera el orden de los visibles ni muta `items`.
- Los IDs que ya no aparezcan en un refresh no cuentan como ocultos. La proyección es pura, sin llamadas remotas.
- El componente conserva el preview actual mediante `FeedPreview key={authScopeKey:activeHomeFeed}`, con desmontaje al cambiar cuenta, sesión o feed. `hiddenKeys` y `lastHiddenKey` son estados de React, no storage.
- El botón «Apartar» nunca es equivalente a `feedsApi.setFeedback`, `mute` o un reporte. No se emiten datos de comportamiento, clicks, dwell time, analytics, cookies ni notificaciones.
- Accesibilidad: controles nativos de 44 px, estados explicados con `role=status`, focos visibles y disposición responsiva. No se elimina el acceso a Feed completo.

## QA y alcance

- Diez pruebas adversariales: orden preservado, ocultamiento de un elemento, idempotencia, deshacer, claves de tipos distintos, all-hidden vs server-empty, respuesta modificada, rechazo de IDs extraños, límite máximo, estado por sesión/feed y privacidad sin efectos remotos.
- Prueba **Chromium real** con Vite loopback y API simulada: invitado sin controles, usuario autenticado con tres tarjetas, apartar/deshacer/restaurar todas, cambiar de feed y resetear el estado, perder autoridad y comprobar que no haya acciones HTTP mutantes.
- CI Node24 / pnpm9 frozen con pruebas, TypeScript, ESLint, Prettier, Chromium y build Web sobre el HEAD exacto. Test B183 integrado a `pnpm check`.
- No modifica API, MongoDB, Android/iOS, permisos, contratos ni dependencias. Una CI focalizada verde no implica release.

## Seguridad y release

`pnpm audit --prod --audit-level high` continúa bloqueado por los advisories activos. #495 corrige las alertas nuevas de `follow-redirects` pero sigue como PR independiente; `node-forge` #133 y `braces` #141 siguen sin upstream fix confirmado. El release #353 está en **HOLD**: no fusionar ni desplegar en nombre de B183 mientras el gate obligatorio esté rojo.
