# B282 — Identidad visual pública de Organizaciones Web

## Alcance del bloque
El servidor ya proyecta `avatarUrl` en `OrganizationCard` y `OrganizationDetail`. La UI pública del directorio y detalle Web tenía nombre/estado/verificación, pero no mostraba avatar. Este carrier recupera **sólo la parte Web** de la histórica #644, dejando Mobile para otra PR porque sus pantallas tienen integración concurrente de compartir organización B275/#743.

- Se reutiliza `PublicProfileAvatar` con su política existente de HTTPS, tamaño y error de carga; no se introduce carga de URLs sin validar.
- El directorio pagina con #734 y ahora combina avatar pequeño, tipo, nombre, institución y verificación. Se preservan paginación, filtros y navegación.
- El detalle mantiene título accesible, información publicada, acciones de compartir/follow y administración; añade avatar autorizado sin mover esos permisos.
- La ausencia de imagen produce la inicial pública, no la URL privada de una cuenta ni la sesión.
- Los estilos actuales de compartir y paginación se conservan junto a los nuevos contenedores flexibles.

## Pruebas y aceptación
Contrato Node `pnpm test:web-organizations-contract` con verificaciones del renderer de avatar, proyección `avatarUrl` en las dos superficies y clases CSS. Verificación en HEAD exacto: Node24/pnpm9 frozen, `pnpm check`, Web TS/ESLint/Prettier/build, 10 critical coverage, Container runtime smoke y auditoría HIGH.

Sin cambios de API, Mongo, Auth, privacidad, dependencias, lockfile, flags o despliegue. La publicación sigue bloqueada por HIGH heredadas #133 node-forge y #705 Zod, aun si este bloque de producto se integra al repositorio.

La fuente #644 incluye también pantallas Mobile no portadas en esta PR; no cerrar #644 hasta reconciliarlas.


Reconciliado sobre `main@9de15aa4cd12f65df2470e6cdf115688772af35e` después de B280/#748. El directorio sigue enviando el filtro institucional tanto en la primera página como en siguientes páginas y conserva los controles accesibles y el CTA de compartir. La implementación antigua #745 solo se usó como fuente de diseño y política, no como rama base.
