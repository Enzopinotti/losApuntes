# B287 — Filtro público de verificación de organizaciones Web

## Producto
El directorio público Web permite combinar búsqueda por nombre, tipo de organización, institución canónica y estado de verificación (Todas / Verificadas / Sin verificar). La selección se envía exclusivamente al servidor mediante el parámetro `verificationState` del contrato B286 (PR #756), sin que la UI infiera un estado a partir de avatares o nombre.

## Contrato y seguridad
- Solo acepta valores `verified` y `unverified`, definidos en `OrganizationVerificationState`; valor vacío omite el filtro.
- `directoryScopeKey` incluye autoridad, nombre, tipo, institución y verificación: cambiar filtros invalida páginas y evita mezclar resultados o mostrar tarjetas de otro estado.
- Primera página y cada continuación con cursor reenvían el mismo valor. Se preservan controles contra cursores repetidos, deduplicación, reintentos y la acción separada de seguir/dejar de seguir ya integrada por #751.
- Se conserva el catálogo institucional, URLs públicas, avatares, navegación a detalles y estado de sesión. Los botones y selects mantienen etiquetas accesibles y dimensiones táctiles.

## Dependencias de integración
El backend B286 (#756) debe integrarse a `main` y demostrar su validación, filtrado Mongo **solo de organizaciones activas** y tests antes de integrar este selector Web; de lo contrario el servidor ignoraría un parámetro todavía no disponible. Esta rama se crea como candidata independiente y solo se promociona después de esa dependencia.

## Verificación
Node24/pnpm9 frozen, `pnpm test:web-organizations-contract`, Web TS/ESLint/Prettier/build, Quality Gate, diez coberturas críticas, Container runtime smoke y Production dependency audit HIGH exact-head. Sin nuevos endpoints, roles, cambios DB, migraciones, dependencias, lockfile, flags o excepciones.

Release sigue HOLD por node-forge #133 y Zod #705, aunque el código de estas funciones se fusione a main; no desplegar ni activar Study Progress hasta remediación y auditoría verde.
