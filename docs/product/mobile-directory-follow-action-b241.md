# B241 — Seguir organizaciones desde el directorio Mobile

Las personas con sesión iniciada pueden seguir o dejar de seguir una organización desde su fila en el directorio Mobile, sin abrir primero el detalle. La acción se presenta como un control separado de la navegación para evitar que un toque de seguimiento también abra la organización.

La lista actualiza el estado únicamente después del ACK de la API. Si la conexión o el servidor dejan el resultado incierto, el controlador consulta el detalle y aplica el estado que confirma el servidor; no repite la mutación. Las operaciones se cancelan y descartan cuando cambia la sesión, el filtro o la autoridad de navegación.

## Validación

- Pruebas del controlador para ACK, reconciliación de timeout sin reintento y cambio de sesión durante una mutación.
- Contrato de Organizaciones para accesibilidad del control y conexión con el controlador.
- TypeScript y las pruebas Mobile.
- Exportaciones Expo iOS/Android, formato del monorepo, higiene y `git diff --check`.

La validación local no equivale a los checks automáticos de GitHub.
