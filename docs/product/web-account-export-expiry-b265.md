# B265 — Exportación privada: disponibilidad temporal correcta en Web

**Origen funcional:** revisión de [PR #658](https://github.com/Enzopinotti/losApuntes/pull/658), reconstruida desde el `main` vigente; no se fusiona una rama histórica sobre cambios recientes.

## Problema y comportamiento

El panel de Seguridad validaba `downloadExpiresAt > Date.now()` durante el render, pero tras completar una exportación dejaba de refrescar automáticamente. Un enlace cuyo plazo acababa de vencer podía seguir **visualmente disponible** hasta que otra acción forzara un render. El servidor seguía reautorizando la descarga: la falla era de feedback del cliente, no un bypass del backend.

Ahora la misma función pura determina tanto el texto de estado como la visibilidad del enlace y si corresponde ofrecer una nueva solicitud. Cuando llega la fecha del servidor, un temporizador acotado refresca el reloj local y deja de ofrecer la descarga. Al volver a la pestaña, recuperar foco o cambiar el estado de autenticación, se reevalúa y reprograma el plazo. El vencimiento puede ocurrir durante una sesión que permanece abierta.

### Invariantes

- No descargar ni cachear bytes sensibles en el navegador; `GET` continúa reautorizado por backend.
- La fecha del servidor no es autorización: la UI solamente representa disponibilidad temporal.
- No usa cookies/token, PII ni enlaces firmados para calcular el tiempo.
- No conserva datos en localStorage/sessionStorage, no cambia APIs ni versiones de export.
- Desmontaje, expiración, cambio de job o sesión limpian el timer y los listeners.
- Retrasos inválidos, negativos o superiores al máximo de `setTimeout` se limitan sin usar `NaN` o overflow.
- La exportación continúa siendo opt-in / feature-gated; sin modificaciones a `STUDY_PROGRESS_ENABLED`.

## Validación

`pnpm test:web-account-export-contract` comprueba límites exactos de tiempo, estados distintos de `completed`, fechas inválidas, cancelación por foco, un único cálculo de disponibilidad y ausencia de blob/localStorage. Complementar con Web TypeScript, lint, Prettier y build de producción.

La **CI exact-head** y el smoke del entorno integrado siguen siendo condiciones de integración. Las HIGH #133 node-forge y #705 Zod continúan bloqueando el gate de dependencias y el release #353. Este bloque no modifica el lockfile, no concede waivers y no declara readiness productiva.
