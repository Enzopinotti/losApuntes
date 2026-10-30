# B283 — Seguir organizaciones desde el directorio Web

Las personas con sesión iniciada ahora pueden seguir o dejar de seguir una organización directamente desde su tarjeta en el directorio. El control muestra el estado disponible para quien navega y mantiene la lista sincronizada después de confirmar el cambio, sin requerir abrir primero el detalle.

Cada acción está acotada a la sesión y a la organización. Si una respuesta de red o del servidor deja incierto el resultado, el directorio vuelve a consultar el detalle para reconciliar el estado; no repite automáticamente la mutación ni presenta un cambio no confirmado como exitoso. Las personas sin sesión conservan el acceso al detalle y reciben la opción de iniciar sesión desde el aviso del directorio.

## Validación

- Contrato Web de Organizaciones, incluyendo la autoridad asíncrona, reconciliación y controles accesibles.
- Build y ESLint Web.
- Formato del monorepo, higiene y `git diff --check`.

La validación local no equivale a los checks automáticos de GitHub.


**Reconciliación 2026-10-30:** implementación extraída como `OrganizationDirectoryFollowAction.tsx` en vez de agregar 130 líneas al componente de directorio. Su `scopeKey` depende de sesión y organización; las páginas del directorio conservan el filtro de institución de B280 y el historial de cursores de B266. Fuente histórica: #649, portada sobre `main@9de15aa4cd12f65df2470e6cdf115688772af35e`.

Sin dependencias, cambios API, permisos, base de datos ni feature flags. La auditoría productiva HIGH #133/#705 sigue en fallo; release #353 HOLD.
