# B242 — Filtrar organizaciones Web por institución

El directorio Web permite limitar la búsqueda a una institución canónica. El filtro reutiliza la búsqueda institucional existente y envía el ID seleccionado al parámetro `institutionId` de la API; nunca compara nombres localmente ni mezcla resultados de una institución al cambiar de filtro.

El estado de búsqueda de instituciones está acotado a la sesión y a su consulta. Elegir o quitar un filtro crea un ámbito independiente de lista, por lo que respuestas anteriores no reemplazan el resultado vigente. La búsqueda por nombre y tipo continúa combinándose con el filtro institucional.

## Validación

- Contrato Web de Organizaciones y verificaciones existentes de calendario/enlace compartido.
- Build y ESLint Web.
- Formato del monorepo, higiene y `git diff --check`.

La validación local no equivale a los checks automáticos de GitHub.
