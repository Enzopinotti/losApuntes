# B281 — Identidad visual de Organizaciones Mobile sobre main actualizado

## Alcance
Las pantallas Mobile del directorio de organizaciones y el detalle individual muestran el `avatarUrl` que autoriza el backend. Se reutiliza `PublicAvatar`, su comprobación HTTPS, su fallback de inicial y su compatibilidad de accesibilidad. No hay solicitudes al perfil privado ni nuevos permisos.

- Directorio: avatar pequeño junto al nombre y estado verificado, conservando los filtros y el mecanismo existente de paginación y recarga.
- Detalle: avatar junto al nombre accesible y badge, conservando el menú nativo de **Compartir organización** ya integrado por #743, seguimiento, publicaciones y eventos.
- La imagen solo se usa desde `organization.avatarUrl` de la proyección pública. Sin imagen válida se presenta la inicial, sin mostrar tokens ni fallar toda la tarjeta.
- No cambia API, navegación, contratos, Auth, Mongo, almacenamiento, dependencias, lockfile o flags.

## Reconciliación
La histórica #644 contiene las mismas inserciones de `PublicAvatar` para Mobile, pero parte de una rama apilada que incluye funcionalidades posteriores y una versión anterior de la pantalla. Este carrier nace de `main` posterior al merge de #743 y porta solo los dos componentes de interfaz Mobile. La parte Web fue separada en la PR #745 para reducir conflictos.

## Pruebas
Contrato UI `organization-public-avatar-screen.test.ts` valida que los dos avatares consumen únicamente `avatarUrl` de Organizaciones, que el componente reutiliza `publicAvatarUrl`, y que persisten título accesible y Share. Ejecutar Mobile tests, Node24/pnpm9 frozen, typecheck, lint, format, Expo export iOS/Android, Quality Gate, 10 critical coverages, Container runtime smoke y production audit HIGH exact-head.

La auditoría de supply-chain continúa bloqueando el release por #133 node-forge y #705 Zod. La incorporación de código a main no autoriza despliegue sin remediación real.


**Reconciliación:** portado en nueva rama sobre `main@9de15aa4cd12f65df2470e6cdf115688772af35e`, sin arrastrar stack de #746 y sin alterar su navegación posterior.
