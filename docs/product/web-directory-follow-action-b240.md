# B240 — Seguir organizaciones desde el directorio Web

Las personas con sesión iniciada ahora pueden seguir o dejar de seguir una organización directamente desde su tarjeta en el directorio. El control muestra el estado disponible para quien navega y mantiene la lista sincronizada después de confirmar el cambio, sin requerir abrir primero el detalle.

Cada acción está acotada a la sesión y a la organización. Si una respuesta de red o del servidor deja incierto el resultado, el directorio vuelve a consultar el detalle para reconciliar el estado; no repite automáticamente la mutación ni presenta un cambio no confirmado como exitoso. Las personas sin sesión conservan el acceso al detalle y reciben la opción de iniciar sesión desde el aviso del directorio.

## Validación

- Contrato Web de Organizaciones, incluyendo la autoridad asíncrona, reconciliación y controles accesibles.
- Build y ESLint Web.
- Formato del monorepo, higiene y `git diff --check`.

La validación local no equivale a los checks automáticos de GitHub.
