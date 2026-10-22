# B237 — Eventos próximos en Organizaciones Mobile

La vista de detalle Mobile ofrece los mismos filtros **Próximos** y **Todos** que Web. Próximos pide a la API `from` con la hora actual, y conserva un cursor separado del historial completo. La vista elegida expone su estado seleccionado a lectores de pantalla y evita duplicar filas al cargar más.

No se agrega permiso de calendario, recordatorio, inscripción ni sincronización. La descarga `.ics` de B234 permanece como una acción Web.

## Validación

- Prueba de controller: filtro de fecha del servidor, paginación independiente y regreso a Todos.
- Suite Mobile, TypeScript, Expo export iOS/Android.
- Contrato Web/Mobile de Organizaciones y pruebas iCalendar.
- Build y ESLint Web, formato, higiene y `git diff --check`.

La validación local no sustituye los checks automáticos de GitHub.
