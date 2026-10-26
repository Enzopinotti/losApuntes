# B269 — Recuperación de cursores del detalle de Organización Mobile

## Diagnóstico y alcance
La rama histórica #663 protege paginación en publicaciones, eventos totales y próximos, pero depende de un árbol móvil todavía no integrado que incluye `upcomingEvents`. En el `main` actual, `MobileOrganizationDetailController` sólo presenta paginación de publicaciones y eventos. Esta rama recupera **las dos listas existentes**, sin importar dependencias viejas ni adelantar futuros contratos.

## Contrato
- Dos historiales opacos independientes, `requestedPostCursors` y `requestedEventCursors`, limitados al contexto actual de usuario y organización.
- Una respuesta con `nextCursor` igual al cursor solicitado o previamente solicitado conserva/deduplica la página, elimina únicamente el próximo cursor de esa lista y muestra `ORGANIZATION_DETAIL_CURSOR_REPEATED` como fallo recuperable.
- Una falla transitoria deja el cursor disponible para reintentar. Sólo las páginas válidas consumen cursores.
- Recarga de organización e invalidación de autoridad limpian ambos historiales. La verificación `isCurrent` impide que respuestas de sesiones/organizaciones anteriores modifiquen el estado.
- No modifica directorio de Organizaciones (que ya tiene sus propios guards), follow/unfollow, API, Auth, almacenamiento, ni esquema de datos.

## Pruebas
- Los tests de controlador confirman reintento tras fallo, conservación de página, prevención de loops y ciclos entre cursores distintos de eventos.
- El contrato canónico se valida mediante `pnpm --filter @losapuntes/mobile test`, TypeScript, Prettier, lint, Mobile iOS/Android export, Quality Gate y critical coverage.
- El gate de producción de dependencias HIGH y el smoke integral de runtime deben pasar **exact-head** antes de integrar; nunca agregar waivers ni confundir test focal con release.

## Integración multiagente
Fuente funcional #663. No copiar pantallas ni campos de upcoming de esa rama: esos cambios están ligados a #646 y requieren reconciliación separada. #663 permanece abierto hasta que este carrier sea aceptado para las listas disponibles; documentar el alcance residual de `upcoming` cuando corresponda.

Estado de release: HOLD por HIGH #133 node-forge y #705 Zod sin remedio verificado del lockfile.
