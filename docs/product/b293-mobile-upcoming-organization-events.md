# B293 — Eventos próximos en Organizaciones Mobile

**Fecha:** 2026-11-10. **Base:** `main@c42c42b7e2368ebd3be3cab574878f0139bcc0e7`. Recupera el alcance funcional de la PR histórica #646 sin arrastrar sus versiones antiguas de las pantallas, API y controlador.

## Experiencia y reglas

- La sección pública de eventos ofrece los filtros **Próximos** y **Todos**, con estado seleccionado accesible y botones de al menos 44 puntos.
- **Próximos** solicita `GET /organizations/:id/events?from=<fecha-UTC>` en la primera página. Cada página siguiente usa solo el cursor opaco que entrega el servidor. No filtra localmente fechas ni inventa eventos futuros.
- Mantiene los resultados, cursores e historiales de **Todos** separados de **Próximos**; volver a Todos no repite la búsqueda ni borra páginas anteriores.
- Deduplica eventos por ID y corta los cursores repetidos, incluyendo ciclos a uno visitado. Una falla de red conserva datos y cursores para que el usuario pueda reintentar. Cambiar de sesión, ruta o foco descarta respuestas tardías por la autoridad del controlador.
- Conserva las acciones de compartir los enlaces HTTPS de eventos incorporadas en #761, además de avatares, publicaciones, verificación y seguimiento.
- No solicita permisos de calendario, no genera reservas/inscripciones ni modifica un evento de origen.

## Aceptación

Pruebas de filtrado `from` solo en primera página, separación de cursores, deduplicación, ciclos, reintentos, accesibilidad y preservación de la función nativa para compartir. Requiere Node24/pnpm frozen, Mobile tests, TypeScript, lint, Prettier, exportación Expo iOS/Android, Quality Gate, 10 coberturas críticas, smoke de Mongo8 y auditoría productiva HIGH en el HEAD exacto.

**Estado de release:** #353 HOLD mientras persistan dependencias HIGH; esta funcionalidad no autoriza un despliegue. Sin cambios de esquema, permisos, dependencias, lockfile, flags ni OAuth.
