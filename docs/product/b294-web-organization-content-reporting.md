# B294 — Reportes de publicaciones y eventos de organizaciones Web

**Fecha:** 2026-11-10. **Base:** `main@c42c42b7e2368ebd3be3cab574878f0139bcc0e7`. Reconciliación del alcance Web de PR histórica #656, sin arrastrar el stack de PRs Mobile ni deshacer B285 (filtro Próximos/Todos).

## Experiencia

Las personas autenticadas pueden seleccionar un motivo de moderación para reportar una publicación o un evento público, y agregar una descripción opcional. Los motivos admitidos son `spam`, `impersonation`, `misinformation`, `harassment`, `inappropriate` y `other`, según vocabulario del backend. La descripción se normaliza NFC, recorta espacios y admite hasta 1500 caracteres; si no está vacía, exige tres caracteres como mínimo.

## Seguridad y estado

- El cliente envía el motivo seleccionado al endpoint de reportes ya existente; no inventa identidad ni resultados.
- El controlador espera respuesta válida `report.id` y estado `pending` antes de mostrar confirmación. Impide repetir reportes confirmados del mismo contenido.
- Los resultados ambiguos (timeout, desconexión, 5xx o respuesta de éxito malformada) quedan marcados **inciertos** y bloquean un segundo POST automático. Errores de validación definitivos siguen siendo reintentables.
- Operaciones y UI están aisladas por autoridad de sesión, organización, tipo de contenido e ID. Cambios de ruta descartan respuestas tardías. Se conserva paginación, filtros, avatares, compartir y el flujo del directorio.
- No agrega roles, permisos, schema, dependencias, flags ni endpoints.

## Aceptación

Tests unitarios del validador y controlador, pruebas adversariales de incertidumbre y cambio de target, contrato Web de montaje, QA exact-head Node24 frozen, Web TypeScript/ESLint/Prettier/build, Quality Gate, diez coberturas críticas, smoke real Mongo8 y auditoría HIGH de producción.

**Release:** #353 continúa en HOLD si hay advisories HIGH; este merge de desarrollo no autoriza producción.
