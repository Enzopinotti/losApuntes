# B295 — Reportes de publicaciones y eventos de organizaciones Mobile

**Fecha:** 2026-11-10. **Base:** `main@436b56e80bd86e48648cc01a7bf38f78b33d1732`. Port funcional de #655 sobre el detalle Mobile actual; no incorpora el stack antiguo de PRs.

## Experiencia

La persona autenticada puede reportar una publicación o un evento público desde su tarjeta. Elige explícitamente uno de los motivos de moderación del servidor y, si quiere, agrega detalles con normalización Unicode NFC, espacios recortados y límite de 1500 caracteres. Los controles radio, botones y mensajes tienen etiquetas accesibles y targets de al menos 44 puntos.

## Integridad y privacidad

- Usa los endpoints autorizados ya existentes por organización, post/evento, ID codificados, motivo validado y señal de aborto.
- El controlador no confirma el reporte sin un `report.id` no vacío, `status=pending` y motivo válido. Un ACK malformado, timeout, desconexión o 5xx queda en estado **incierto**: se bloquea otro POST para evitar duplicados.
- Errores de validación definitivos siguen siendo reintentables. Operaciones viejas no actualizan un nuevo contenido después de cambiar ruta, sesión o target.
- Conserva los filtros Próximos/Todos y sus cursores (B293/#768), enlaces seguros compartibles (#761) y el resto del detalle Mobile.
- No introduce nuevos permisos, esquema, endpoints backend, migraciones, dependencias, lockfile ni flags.

## Pruebas y aceptación

Tests de motivos y límites, rutas HTTP autorizadas, ACK correcto y malformado, errores ambiguos, reintento tras 422 y respuestas tardías. Contrato de Org Mobile, TypeScript, ESLint, Prettier, Expo iOS/Android, Quality Gate, diez coberturas críticas, smoke real y auditoría HIGH exact-head.

**Release:** #353 sigue HOLD por HIGH de dependencias; merge de desarrollo no implica publicación.
