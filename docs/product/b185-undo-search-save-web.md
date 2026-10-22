# B185 — Deshacer un guardado sin salir de la búsqueda

Estado: añadido al candidato integrado **PR #518**; sin merge ni despliegue.

## Problema del estudiante

B175 permitió guardar un recurso desde los resultados, pero después de hacerlo el botón quedaba bloqueado permanentemente. Para corregir un guardado por error, el estudiante debía abandonar la búsqueda y localizar el recurso en otra pantalla.

## Comportamiento

- Buscar y **Guardar apunte** → sólo una respuesta explícita `{ saved: true }` presenta la confirmación. Se habilita **Quitar de guardados**.
- **Quitar de guardados** usa el endpoint actual `DELETE /resources/:id/save`; sólo el HTTP exitoso cambia el estado local a **Quitado de guardados. Podés volver a guardarlo**.
- Si el estudiante se arrepiente, **Guardar apunte** queda disponible otra vez; el PUT vuelve a comprobar la autorización de Resources.
- Mientras guarda o quita, el botón queda deshabilitado; un ref impide solicitudes simultáneas por repetición rápida. Las operaciones usan el mismo `useAsyncAuthorityFence` ligado a recurso + usuario + sesión.
- Error de red, timeout o 5xx al quitar: **no se supone que el DELETE haya fallado o tenido éxito**, porque pudo procesarse antes del corte. Se muestra alerta **No pudimos confirmar si se quitó el apunte. Revisá Guardados antes de reintentar** y el botón **Reintentar quitar**. No hay rollback ficticio.
- 401/403/404/410: error de autorización acotado, sin exponer datos ni mostrar éxito.
- Usuario anónimo: la búsqueda sigue siendo pública, pero ninguna mutación de guardados está disponible. Un cambio de sesión nunca presenta confirmaciones viejas.

## Alcance seguro

Se reutilizan `resourcesApi.save` y `resourcesApi.unsave`, sin endpoints, permisos, tablas, dependencias, flags, ni campos de PII nuevos. El servidor sigue siendo la autoridad: el componente sólo proyecta el último acuse de la **sesión actual**; no intenta inferir si un recurso ya estaba guardado al cargar los resultados, para evitar N llamadas por página.

## Integración y trazabilidad

El B182 original se compuso de 32 archivos idénticos a cuatro PR fuente. B185 modifica **exclusivamente dos archivos procedentes del PR #509**:
- `apps/web/src/features/search/SearchSaveAction.tsx` (acción reversible).
- `scripts/test-web-search-contract.mjs` (nuevos contratos y aserciones).

Se mantienen los 32 registros de procedencia originales en el manifiesto Git; `scripts/test-b182-study-journey-integration.mjs` exige **30 archivos byte-idénticos** y exactamente estas **2 extensiones documentadas**. Cualquier modificación no declarada en el resto de los archivos fuente sigue fallando.

## Criterios y pruebas

1. Contrato Search: HTTP PUT reconocido, HTTP DELETE sin éxito falso, respuesta incierta, 401/403/404/410, distinción de alerta/status, fence por cuenta y sesión, protección contra doble pulsación.
2. B183 Playwright con API simulada: guardar → quitar → volver a guardar produce exactamente 2 PUT y 1 DELETE y permite continuar al detalle.
3. **B184 Chromium con API y MongoDB reales:** guardar → verificar presencia en GET `/resources/saved` → quitar → verificar ausencia real → volver a guardar → verificar presencia real. Después sigue el recorrido de revocación de permisos, sesión y kit.
4. TypeScript, ESLint, Prettier, Web build, todos los contratos B182/B181, Quality Gate, diez coberturas críticas y smoke real + cleanup pasan sobre el **mismo SHA**.
5. Se ejecuta sin excepción `pnpm audit --prod --audit-level high`: las dos HIGH conocidas node-forge #133 y braces #141 **siguen bloqueando release #353**, pues sus avisos GHSA no publican versiones corregidas; B185 no cambia dependencias ni criterios de seguridad.

No equivale a autorización de producción. El PR permanece Draft sin merge/deploy hasta la resolución de los gates.
