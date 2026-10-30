# B285 — Eventos próximos y todos en Organizaciones Web (main 30/10/2026)

## Funcionalidad
La página pública de Organización alterna entre **Próximos** y **Todos**. Se porta el valor del PR histórico #645 sobre el estado real de la página, que ya incorporó avatares, enlaces seguros iCalendar, compartir organizaciones, seguimiento y controles contra ciclos de cursor.

- Próximos envía al endpoint existente `GET /organizations/:id/events` un parámetro `from` con `new Date().toISOString()`, **solo en la primera página**. El servidor es la autoridad del filtro temporal.
- Todos conserva el listado inicial del detalle y las páginas cargadas. Cambiar de vista **no contamina** los cursores ni descarta datos de la otra vista.
- Próximos mantiene `requestedCursors` propio, deduplica eventos por ID y corta ante cursor repetido/cíclico, sin realizar más llamadas. Errores transitorios permiten reintentar el cursor actual; un error de ciclo ofrece recargar la vista desde cero.
- Los estados se acotan a `organizationScopeKey` y se reinician cuando se carga el detalle de otra identidad/organización. Una petición vencida no pisa una autoridad diferente por `useAsyncAuthorityFence`.
- Los botones accesibles `aria-pressed`, `aria-label`, `disabled` durante acciones y tamaño táctil de 44px anuncian vista y evitan acciones ambiguas.
- La descarga iCalendar sigue disponible solo cuando el evento lo permite; se mantienen sus controles de URL HTTPS y eventos cancelados.

## Contrato y verificación
Se amplía el método `organizationsApi.events(id,cursor,signal,from?)`; los clientes existentes siguen usando los tres primeros parámetros. El endpoint ya acepta `from`; no se modifican datos, cachés, permisos, API backend, Auth, base de datos, contratos, dependencias ni lockfile.

Pruebas integradas en `scripts/test-web-organizations-contract.mjs`: filtro desde servidor, UI, separación de cursores, ciclo, scope, controles accesibles y contrato de llamada. Además requieren `pnpm check` (Node24/pnpm9 frozen), TS/ESLint/Prettier Web, build release, 10 coberturas críticas, Container runtime smoke real y Production dependency audit HIGH exact-HEAD.

## Seguridad y release
Las HIGH heredadas #133 node-forge y #705 Zod siguen RELEASE HOLD; no se agregan excepciones, se ignoran hallazgos ni se autoriza despliegue si audit continúa fallando. El antiguo PR #645 no se cierra hasta comprobar qué funcionalidad histórica aún falta en Mobile (#646 es un flujo independiente).
