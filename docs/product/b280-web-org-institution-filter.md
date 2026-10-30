# B280 — Filtro institucional canónico en directorio Web

**Fecha:** 2026-10-30. **Base:** main `0370600193acac0a59919d019b32e8257c267292`. Reconciliación del valor de la PR histórica [#651](https://github.com/Enzopinotti/losApuntes/pull/651) sobre B266 paginación ya mergeada (#734).

## Experiencia

Un visitante puede filtrar las organizaciones del directorio por una institución académica canónica obtenida desde `organizationsApi.searchInstitutions`. La UI distingue búsqueda libre de selección de una opción. La búsqueda del directorio solo usa `institutionId` de la institución elegida; jamás filtra comparando texto de nombres locales. La selección convive con búsqueda por nombre y tipo.

- **Primera página y siguientes:** `organizationsApi.search` lleva `institutionId` y el mismo cursor opaco. Al modificar institución o quitar el filtro, el scope de paginación cambia, reinicia historial de cursores y descarta páginas anteriores.
- **Seguridad:** sin nuevo endpoint, sin elevar permisos o exigir login. La institución elegida se acota al `authScopeKey`; resultados y peticiones asíncronas están cercados con `useAsyncAuthorityFence`. Cambiar sesión limpia filtro institucional.
- **Estados accesibles:** botón deshabilitado hasta disponer de 2 caracteres, aviso de búsqueda vacía (`role=status`), institución seleccionada y acción Quitar filtro. Altura mínima de botón 44px.
- **Sin cambios de backend:** las búsquedas institucionales y el parámetro canónico `institutionId` ya existen en la API. No se alteran índices, rutas, Auth, OAuth, reglas de verificación ni flags.
- **Interoperabilidad:** conserva deduplicación, reintentos y protección de ciclos de B266 y permite futuras mejoras de avatares sobre el directorio.

## Validación

`pnpm test:web-organizations-contract`: contrato `institutionId`, primer/segundo fetch, aislamiento de scope, listeners de búsqueda, selección y clear, estilos/ARIA, regresión de B266. Verificar Node24/pnpm9 frozen, TypeScript, lint/Prettier, Web build, Quality Gate, 10 críticos, smoke Docker real y audit HIGH en HEAD exacto.

**Integración y release:** la rama no agrega waivers, nuevos paquetes ni actualizaciones del lockfile. Mientras #133 node-forge y #705 Zod permanezcan HIGH, #353 sigue RELEASE HOLD. El merge de desarrollo no certifica deploy; se siguen aplicando los gates propios del repositorio.
