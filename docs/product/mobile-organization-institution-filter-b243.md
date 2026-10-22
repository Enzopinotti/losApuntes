# B243 — Filtrar organizaciones Mobile por institución

El directorio Mobile permite elegir una institución canónica y combinarla con la búsqueda por nombre y tipo. Los resultados de catálogo se buscan explícitamente, se muestran como opciones accesibles y el directorio envía el ID elegido al parámetro `institutionId` existente de la API.

El ámbito de la institución seleccionada y de cada búsqueda incluye la autoridad de navegación. Al cambiar cuenta, filtro o consulta, los resultados anteriores se cancelan o quedan fuera del ámbito visible; la paginación conserva el ID institucional elegido.

## Validación

- Pruebas del controlador para conservar `institutionId` entre la primera página y la paginación.
- Contrato de Organizaciones para el catálogo, el transporte y la selección accesible.
- TypeScript y pruebas Mobile.
- Exportaciones Expo iOS/Android, formato del monorepo, higiene y `git diff --check`.

La validación local no equivale a los checks automáticos de GitHub.
