# B291 — Compartir enlaces externos de eventos desde Mobile

Estado: **CANDIDATE**, no implica publicación ni aceptación del release.
Baseline inicial: `main@7eaf5dff6d866426321855361da285e5c1416cb7`.

## Intención y trazabilidad

Superficie Mobile de eventos de Campus Organizations: `ORG-FR-007`,
`MOB-FR-005`, `MOB-FR-009`, `NFR-SEC-001`, `NFR-UX-001`,
`NFR-A11Y-001`. Esta PR incorpora una acción nativa de compartir la
**URL externa pública**, no el archivo .ics de las PR históricas #657/#659.
No cambia permisos ni disponibilidad en API.

## Contrato de uso

- Sólo eventos `scheduled` con `externalUrl` válida HTTPS, sin credenciales
  incrustadas, controles/espacios ni longitud superior a 2048 caracteres
  muestran **Compartir evento**. Se evita compartir enlaces no confiables
  desde el menú nativo.
- Se usa `Share.share` sin permisos de calendario, nuevas dependencias ni
  almacenamiento de URLs. El título visible se limita a 160 caracteres,
  saneando controles; una URL validada también puede compartirse sin título.
- Mientras se abre el share sheet se deshabilitan otros shares del detalle;
  un fallo muestra un error recuperable junto al evento, sin afirmar éxito.
- Una navegación/cambio de autoridad invalida el resultado tardío de la
  operación de compartir. El servidor sigue siendo autoridad del evento y
  de su visibilidad.
- Los eventos `cancelled` y los enlaces HTTP/JS/credential-bearing no ofrecen
  esta acción. La funcionalidad existente de abrir enlaces se conserva.

## Validación

1. `pnpm install --frozen-lockfile` con la toolchain pinneada.
2. `pnpm --filter @losapuntes/mobile test` y `check:types`.
3. `pnpm --filter @losapuntes/mobile format:check`.
4. `pnpm --filter @losapuntes/mobile build` (Expo iOS y Android).
5. Quality Gate, coberturas críticas, runtime smoke y audit de dependencias
   sobre el HEAD exacto; no se trasladan verdes de otra revisión.

Las vulnerabilidades HIGH de dependencias y el paquete externo de
Production Readiness continúan como gates separados. No desactivar
controles ni declarar release READY por una PR de UX.
