# B288 — Filtro de verificación en el directorio Mobile de Organizaciones

## Funcionalidad
El directorio Mobile permite seleccionar **Todas / Verificadas / Sin verificar**, combinándolo con nombre, tipo e institución canónica y preservando los resultados correctos al paginar.

- Utiliza el tipo `OrganizationVerificationState` y sólo remite `verified` / `unverified`; `null` elimina el filtro.
- El parámetro se envía a la API, luego se conserva en el controlador entre primera página y sucesivas llamadas con cursor.
- El `authorityKey` combina usuario/sesión, foco, búsqueda, tipo, verificación e institución, descartando resultados obsoletos al cambiar cualquiera de esas condiciones.
- El selector emplea `radiogroup`, `radio`, estado seleccionado anunciado y estilos táctiles existentes. Mantiene el avatar, el enlace a detalle, la gestión de errores y búsqueda institucional de #753.
- El backend B286 (#756) valida el parámetro y sigue devolviendo solo organizaciones activas. No se hace filtrado client-side de resultados parciales.

## QA
Tests de transporte HTTP, controlador con cursor y estado verificado combinado con institución, contrato de pantalla accesible y preservación de componentes actuales. Requiere Node24, pnpm9 frozen, Mobile TS/ESLint/Prettier/test, Expo iOS/Android export, Quality Gate, 10 critical coverages, Mongo Container smoke y auditoría HIGH exact-head.

## Alcance
Se porta exclusivamente la parte Mobile de #654, sin recuperar el árbol apilado. La Web se reconcilia por #757. No hay nuevas dependencias, cambios Auth, permisos, rutas, Mongo o lockfile. Seguridad de producción continúa **HOLD** por las HIGH heredadas #133 node-forge y #705 Zod, sin waiver ni deploy.
