# B289 — Orden público de secciones en perfiles Mobile

**Fecha:** 2026-10-30. **Base:** `main@83d5534df6aede1131c70beff48e2dcee2122792`. Fuente funcional: PR histórica #628 (B219).

## Objetivo

El perfil público Mobile respeta `profile.presentation.sectionOrder` enviado por el servidor en lugar de fijar por código el orden profesional, académico, aprendizaje, habilidades y actividades. La identidad, el avatar y la biografía se mantienen en su cabecera; las acciones de seguir, conectar y compartir siguen al final.

El helper `publicProfileContentSectionOrder` descarta `about`, `contributions`, secciones no proyectadas y duplicadas. No crea contenido privado ni completa silenciosamente campos ausentes. Cada sección aprobada utiliza una tarjeta independiente.

## Reconciliación de código

La rama original #628 tenía una implementación más antigua de las actividades. Esta versión conserva el contenido actual de la tarjeta de actividad pública: etiqueta de tipo, fecha, descripción y enlace público con política existente `PublicProfileActivityLink`. Conserva la protección de autoridad de navegación y los componentes sociales existentes; no incorpora patches completos de la PR vieja.

## Pruebas

- Tests unitarios de orden, deduplicación y ausencia de secciones no publicadas.
- Test de contrato UI que preserva actividades enriquecidas, enlaces autorizados y acciones sociales.
- Actualización del contrato académico para la nueva ubicación del renderizado.
- Requiere Node24/pnpm9 frozen, Mobile tests, TS, ESLint/Prettier, Expo iOS/Android, Quality Gate global, diez críticos, smoke real de contenedores, auditoría HIGH exact-head.

Sin dependencias, API, Auth, Mongo, lockfile, flags ni permisos nuevos. El release #353 sigue en HOLD por la auditoría de dependencias (#133 node-forge y #705 Zod).