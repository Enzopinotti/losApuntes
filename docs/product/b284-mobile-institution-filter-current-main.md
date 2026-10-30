# B284 — Filtrar organizaciones Mobile por institución

El directorio Mobile permite elegir una institución canónica y combinarla con la búsqueda por nombre y tipo. Los resultados de catálogo se buscan explícitamente, se muestran como opciones accesibles y el directorio envía el ID elegido al parámetro `institutionId` existente de la API.

El ámbito de la institución seleccionada y de cada búsqueda incluye la autoridad de navegación. Al cambiar cuenta, filtro o consulta, los resultados anteriores se cancelan o quedan fuera del ámbito visible; la paginación conserva el ID institucional elegido.

## Validación

- Pruebas del controlador para conservar `institutionId` entre la primera página y la paginación.
- Contrato de Organizaciones para el catálogo, el transporte y la selección accesible.
- TypeScript y pruebas Mobile.
- Exportaciones Expo iOS/Android, formato del monorepo, higiene y `git diff --check`.

La validación local no equivale a los checks automáticos de GitHub.


**Reconciliación 2026-10-30:** portado desde la PR histórica #652 sobre `main@6af1e8471c69d618f96f08db394c24b205fdeb98` (ya con B281 Mobile avatar y B282 Web avatar). Se recuperó únicamente la búsqueda de catálogo y el parámetro canónico de directorio; no se arrastraron cambios históricos en cursores de detalle, seguimiento nativo, API, Auth ni lockfile.

La lista mantiene el guard de ciclos de página y los avatares ya integrados. El `institutionId` está presente en el request inicial y en la paginación por cursor. La búsqueda de institución solo se dispara explícitamente y las respuestas atrasadas se descartan al cambiar sesión, filtro o estado de visibilidad.

Release #353 sigue HOLD mientras la auditoría productiva HIGH de #133 y #705 no esté remediada.
