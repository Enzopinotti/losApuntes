# B175 — Guardar apuntes desde resultados de búsqueda

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

Las regresiones de `scripts/test-web-search-contract.mjs` comprueban confirmación estricta, errores inciertos, restricción de acción a usuarios autenticados, uso de Resources API, fencing y ausencia de credenciales o storage en el nuevo componente. `scripts/test-web-search-save-browser.mjs` prueba la experiencia en Chromium local con la API aislada: invitado sin control de guardado, éxito autenticado, doble clic sin PUT duplicado, respuesta ambigua sin reintento y rechazo 403.

La prueba de navegador simula autenticación y respuestas API; no sustituye una aceptación con backend y Mongo reales. Esa aceptación debe comprobar:

1. El recurso guardado aparece en Guardados tras la confirmación del servidor.
2. Cambiar sesión/cuenta durante la petición no muestra estado de otra autoridad.
3. Un recurso retirado o con acceso revocado no se transforma en éxito ficticio.
4. Un timeout posterior al envío no se anuncia como éxito ni como rollback.

La búsqueda conserva el filtro al abrir y retomar un apunte; su contrato tiene regresiones existentes. La integración en `main` no es una aprobación de despliegue. La auditoría global de dependencias y los controles de release se siguen evaluando por separado; este bloque no los cambia ni los elude.
