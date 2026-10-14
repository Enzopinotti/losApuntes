# Web Network — serialización de acciones por sesión

**Alcance:** corrección UX/consistencia sobre Social v1; referencias SOC-FR-001, SOC-FR-002, NFR-REL-001 y #85. No altera el contrato HTTP ni las reglas de autorización.

## Problema

La pantalla Red podía disparar operaciones contrapuestas antes de que React publicara el estado `busy`. Por ejemplo, dos clics rápidos sobre **Aceptar** y **Rechazar** para la misma solicitud, o una mutación mientras la lista solicitaba la página siguiente. Aunque la API valida ownership/estado y aplica idempotencia donde corresponde, abortar una solicitud desde el navegador no garantiza que el servidor no haya aplicado el cambio.

## Cambio

- Una instancia efímera de `NetworkActionGate` es propietaria de **una acción por scope de cuenta/sesión** (mutaciones Follow/Connection y cargar más de Following/Connections).
- `tryAcquire` reserva la acción **sincrónicamente**, antes de llamar a la API y antes del siguiente render. Clics repetidos o acciones diferentes sobre el mismo scope no arrancan otra petición.
- La UI deshabilita los controles de relaciones y paginación mientras hay una acción pendiente. Las búsquedas de perfiles mantienen su propia autoridad de lectura.
- Cada petición libera sólo su propio lease; un `finally` antiguo no puede desbloquear una acción iniciada por otra cuenta/sesión.
- El estado de resultados sigue protegido por `useAsyncAuthorityFence`: el gate reduce concurrencia local pero nunca reemplaza auth, validación backend, control de sesión, retry server-side ni reautorización.

No persistimos el lock ni conservamos secretos, IDs de sesión o relaciones fuera de la memoria del componente. No se crean nuevos endpoints ni se modifica la paginación bounded.

## Aceptación y límites

La prueba canónica `pnpm test:web-network-presentation` ahora comprueba: exclusión sincrónica frente a clics opuestos, bloqueo de paginación durante acciones, imposibilidad de liberar con lease falsificado, relevo de scope con sesión nueva y liberación idempotente.

El contrato estático comprueba también el cableado de los tres flujos y los controles deshabilitados. Hace falta validar en navegador con dos clics rápidos, sesión cambiada durante un fetch y paginación tras un error; la prueba determinista no se presenta como evidencia browser-E2E.

**Nota de seguridad:** ninguna validación aquí concede ni retiene acceso a otro Profile; la API sigue siendo autoridad para Follow y Connection.
