# B262 — Compartir páginas públicas de organizaciones en Web

## Fuente y problema

PR histórica #647 implementó compartir enlaces del detalle público, pero forma parte de una pila vieja de Web/Mobile y sus pantallas ya evolucionaron. Se recupera la intención sin fusionar ese árbol: esta rama crea un **componente acotado** y se integra solamente al encabezado actual de `Organization.tsx`.

## Comportamiento

- El enlace se construye de un `Organization.id` canónico UUID v4 con `organizationPublicPath`, nunca de texto editable de institución/organización.
- La ruta `/organizations/:id` no concede acceso, follow, management, claim ni verificación.
- Mostrar el botón no exige sesión; sólo se comparte lo que la proyección pública del servidor ya ofrece.
- Al pulsar, usa Web Share API; si no está disponible o falla, intenta el portapapeles.
- Si el portapapeles también falla, presenta un campo `readOnly` seleccionable con mensaje accesible y sin recopilar datos de usuario.
- Cancelar el diálogo de compartir no genera confirmación falsa. Los controles quedan deshabilitados durante la operación.
- `key={organization.id}` reinicia mensajes al navegar a otra organización; no mezcla estados entre entidades.
- No cambia Auth, Organizations API, permisos, Follow, backend, contratos, cookies, storage, lockfile ni deploy.

## QA y trazabilidad

- Suite `test-web-organization-share-b262.test.mjs`: UUID v4 válido/alterado/case, URLs maliciosas, rutas canonizadas, fallback nativo/clipboard/manual, alertas, accesibilidad y conservación de Follow/Manager.
- Agregado a `pnpm test:web-organizations-contract` existente.
- Verificar Node24/pnpm9 frozen, calidad/typecheck/ESLint/Prettier/build Web y smokes apropiados, además de las diez coberturas críticas y auditoría de dependencias **exact-head**.
- La fuente #647 permanece pendiente hasta su reconciliación final. `main` no puede recibir este carrier si sus checks de seguridad requeridos fallan.

Estado: **DRAFT/HOLD** mientras `node-forge` #133 y Zod #705 tengan HIGH activas; no nuevos waivers y sin habilitar Study Progress.

IDs de requisitos: ORG-FR-001/010, PLAT-FR-001, NFR-SEC-001, NFR-A11Y-001 y CHG-005/007.
