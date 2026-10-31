# B292 — Paginación nativa de actividad pública de perfiles

Estado: **CANDIDATE / DRAFT**, no indica despliegue ni cierre de seguridad.
Base de trabajo: `main@7eaf5dff6d866426321855361da285e5c1416cb7`.

## Necesidad de producto

El perfil público Mobile ya presenta actividades enriquecidas y conserva el
orden de secciones permitido por el servidor, pero la paginación posterior
sólo indicaba que había más resultados. El usuario debe poder obtener
siguientes páginas sin perder las actividades previas ni la privacidad.

Requisitos aplicables: `PROF-FR-006`, `PROF-FR-009`, `MOB-FR-001`,
`MOB-FR-005`, `MOB-FR-007`, `MOB-FR-008`, `NFR-PRIV-001`,
`NFR-PERF-001`, `NFR-A11Y-001`.

## Contrato y límites

- El cliente consume el endpoint existente
  `GET /profiles/:profileId/activities?cursor=...&limit=...`.
  Las credenciales de Mobile siguen en la AuthSession, no en la URL.
- El servidor define qué actividades se exponen. El cliente no recibe ni
  reconstruye actividades privadas, no inventa permisos y no agrega backend.
- Las páginas se agregan por ID de actividad, manteniendo una única tarjeta.
  Se preservan tipo, fechas, descripción y enlaces seguros ya integrados.
- Un error temporal conserva resultados y cursor para reintentar; una respuesta
  de perfil, sesión o autoridad anterior se descarta.
- Cursores repetidos o cíclicos se detienen para evitar un bucle permanente.
- Las secciones usan el orden público autorizado por el servidor y la
  navegación es una acción explícita, no infinite scroll.
- La interfaz diferencia carga, ausencia de resultados y error recuperable.
  No agrega librerías ni cambia el lockfile.

## Validación

Ejecutar `pnpm install --frozen-lockfile`, tests Mobile, TypeScript,
Prettier, Expo iOS y Android, Quality Gate, cobertura crítica,
container runtime smoke y auditoría productiva sobre el SHA exacto.

La auditoría HIGH heredada y Production Readiness mantienen sus gates propios.
No promover a release READY ni activar producción por este bloque.
