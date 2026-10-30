# B270 — Avatar autorizado en el perfil público Mobile

## Funcionalidad (reconciliación de #623)

La pantalla actual de perfiles públicos Mobile muestra nombre, biografía y resumen académico B261, pero todavía no representa el avatar habilitado por la proyección del backend. Esta integración recupera exclusivamente la funcionalidad de #623 sobre el `main` real sin restaurar una pantalla vieja ni desplazar sus mejoras.

- El cliente usa `data.profile.about?.avatarUrl` del servidor; no consulta archivos de otros usuarios ni reconstituye campos ocultos.
- Solo acepta URLs HTTPS absolutas de longitud acotada sin credenciales embebidas. URL inválida o imagen con error de carga presenta inicial visible del nombre público.
- Avatar decorativo fuera del árbol de accesibilidad; el nombre principal conserva el encabezado accesible.
- No cambia Auth, navegación, filtros, backend, contratos, almacenamiento, dependencias ni `pnpm-lock.yaml`.

## Commits atómicos y pruebas

1. Política de URL/initial de avatar público.
2. Componente `PublicProfileAvatar` con fallback.
3. Integración quirúrgica en `search-result-screens.tsx`, preservando B261 y relaciones sociales.
4. Pruebas unitarias HTTPS, credenciales, data URL, longitud, caracteres multilingües e inicial vacío.
5. Prueba contractual de uso exclusivo de la proyección pública.
6. Documentación de alcance y aceptación.

La suite Mobile descubre las pruebas `public-profile-avatar*.test.ts`. Verificar en **HEAD exacto** Node 24 + pnpm 9 frozen, `pnpm --filter @losapuntes/mobile test`, TypeScript, ESLint, Prettier, export JS Android/iOS, Quality Gate, diez coberturas críticas, runtime smoke y auditoría de dependencias HIGH. Mantener DRAFT/HOLD mientras #133 node-forge y #705 Zod sigan activos; nunca introducir excepciones para inflar el número de merges.

No cerrar la #623 hasta aceptar e integrar realmente este replacement.
