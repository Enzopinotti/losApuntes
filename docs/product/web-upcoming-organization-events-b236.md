# B236 — Filtrar eventos de organizaciones por fecha

El detalle Web ahora permite alternar entre **Próximos** y **Todos**. Próximos consulta el filtro `from` que ya ofrece la API usando la hora actual; Todos conserva la lista incluida en el detalle. Cada vista mantiene su propio cursor, así que cargar una página en una no desplaza la otra.

El cambio no altera orden, persistencia, permisos ni el contrato de eventos. La descarga iCalendar B234 sigue disponible para cada evento vigente en ambas vistas.

## Validación

- Contrato Web de Organizaciones y pruebas iCalendar B234.
- Build y ESLint Web.
- Formato del monorepo, higiene y `git diff --check`.

La validación local no equivale a los checks automáticos de GitHub.
