# B275 — Compartir enlaces de organizaciones desde Mobile

## Producto
La pantalla de detalle de Organizaciones Mobile permite ahora compartir el enlace público de la organización mediante `Share.share`, con selección del destino por el usuario y sin enviar contenido automáticamente.

- Solo IDs UUIDv4 válidos pueden generar `losapuntes:///organizations/:organizationId` en minúsculas.
- El texto del menú nativo incluye únicamente el nombre público visible y el enlace interno a la organización, sin credenciales, información de sesión o datos privados.
- La acción se ofrece explícitamente al usuario y conserva el detalle si el sistema falla al abrir el share sheet. Se muestra error accesible y recuperable.
- Al cambiar de sesión, de identidad o de foco, el estado de error se limpia con la autoridad de pantalla existente.
- Abrir el enlace en otra cuenta no concede permisos: Expo Router navega a la pantalla pública y la API vuelve a validar visibilidad.

## Reconciliación y pruebas
La fuente histórica #648 contiene una implementación equivalente sobre una rama apilada con avatares y filtros de eventos no fusionados. B275 copia el helper y tests de UUID exactos, e integra únicamente el share sheet en la pantalla de `main` del 30-Oct-2026. No copia código antiguo del detalle ni cambia el controlador.

Pruebas: helper UUID inválidos, inyección de segmentos/query, caso válido, integración UI y privacidad, `pnpm --filter @losapuntes/mobile test`, TypeScript/Prettier/lint, export iOS/Android, 10 coberturas críticas, Mongo runtime smoke, auditoría HIGH exact-head. Sin dependencias nuevas, DB, esquema, permisos, flags, saltos de CI ni deploy.

## Gate de release
La incorporación del código a `main` no levanta el HOLD de seguridad por #133 node-forge y #705 Zod: auditoría `pnpm audit --prod --audit-level high` continúa obligatoria. No cerrar #648 hasta verificar paridad de UX y las funcionalidades restantes de su rama.
