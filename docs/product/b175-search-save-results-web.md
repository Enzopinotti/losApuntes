# B175 — Guardar apuntes desde resultados de búsqueda

Estado: **CANDIDATE — PR Draft, no integrado ni desplegado**.

## Problema

La búsqueda global mostraba los Resources disponibles, pero obligaba a abrir la ficha de cada apunte para guardarlo. Para el recorrido de valor de Los Apuntes —buscar → encontrar material útil → guardar— esto agregaba una navegación innecesaria.

B175 incorpora un botón **Guardar apunte** en cada tarjeta de recurso del grupo **Apuntes y recursos**, reutilizando el endpoint existente `PUT /resources/:id/save`. El estudiante conserva el resultado y sus filtros, sin crear un store paralelo.

## Semántica del usuario

- Anónimo: conserva la búsqueda pública y el enlace **Ver recurso**; un mensaje explica que el guardado exige iniciar sesión. No se invoca ninguna mutación sin sesión.
- Autenticado: puede guardar desde el resultado. El botón se bloquea mientras la operación está pendiente y tras una respuesta explícita `{ saved: true }`.
- Confirmación: sólo se muestra **Guardado en tu biblioteca** cuando el backend confirma el resultado. La UI no asume que ya estaba guardado por aparecer en Search.
- Falla de autenticación o permisos (401/403/404/410): mensaje acotado que indica actualizar búsqueda o revisar la sesión, sin exponer detalles privados.
- Falla de red, timeout, error 5xx o respuesta inesperada: **resultado incierto**, mensaje para consultar Guardados antes de reintentar. El PUT existente es idempotente; no se inventa rollback.
- Una búsqueda posterior o una cuenta/sesión distinta no recibe mensajes pendientes de la anterior. El resultado guardado se gestiona por recurso y ámbito de sesión.
- **Guardar no concede acceso**: sigue aplicando reautorización del dominio Resources para abrir o descargar, aunque el apunte permanezca en la biblioteca.

## Límites deliberados

No modifica Search API, estado persistido de Resources, bookmarks previos, visibilidad ni grants. No agrega acceso offline, historial de búsquedas, telemetría, notificaciones, cambios Mobile, dependencias, tablas o nuevas colecciones. La lista inicial no consulta si cada apunte ya estaba guardado: para evitar fan-out, el botón dice **Guardar apunte** hasta recibir confirmación del PUT.

Requisitos vigentes: `RES-FR-009` (guardar no concede acceso), `RES-FR-012` (retry seguro), `SEARCH-FR-002` (visibilidad antes que relevancia), `PLAT-FR-001` (backend authoritative), `NFR-REL-001` (idempotencia en red).

## Pruebas y aceptación

Las regresiones del `scripts/test-web-search-contract.mjs` comprueban confirmación estricta, errores inciertos, restricción de acción a usuarios autenticados, uso de Resources API, fencing y ausencia de credenciales o storage en el nuevo componente.

Aceptación end-to-end pendiente:
1. Invitado puede buscar y abrir resultados sin ver un botón activo de guardado.
2. Usuario autenticado guarda un recurso y éste aparece en su biblioteca tras confirmación del servidor.
3. Toques repetidos no envían mutaciones concurrentes de una misma tarjeta.
4. Cambiar sesión/cuenta o ruta durante la petición no muestra resultados del usuario anterior.
5. Un recurso retirado o con acceso revocado no se transforma en éxito ficticio.
6. Timeout después de envío no se anuncia como éxito ni como rollback.
7. Volver desde la ficha conserva el filtro de materia del enlace de búsqueda.

**Release:** verificar el candidate SHA con `pnpm test:web-search-contract`, `pnpm check`, lint/typecheck/build y aceptación browser contra API real. El audit productivo #133/#141 y el release #353 HOLD siguen bloqueantes. Sin merge/deploy ni waivers hasta completar gates.
