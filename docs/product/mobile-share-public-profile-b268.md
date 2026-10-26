# B268 — Compartir perfiles públicos en Mobile

## Antecedentes
El carrier histórico #622 agrega una acción nativa de compartir para perfiles públicos, pero parte de una rama apilada con pantalla Mobile anterior a la inclusión del resumen académico B261. Este bloque porta sólo el helper, componente y pruebas, y modifica quirúrgicamente `search-result-screens.tsx` en `main`.

## Comportamiento
- Un usuario autenticado que abre un perfil público puede tocar **Compartir perfil**.
- La app entrega al selector de compartir del sistema solamente `losapuntes:///profiles/:profileId`, con UUID v4 canónico.
- El enlace recibido vuelve a consultar el perfil y aplica los permisos del servidor; compartir una referencia no concede acceso privado.
- IDs inválidos, rutas anidadas o query con tokens no producen enlaces.
- Los errores del share sheet muestran un aviso recuperable, sin navegar ni guardar credenciales.
- No cambia la sesión, el motor de búsqueda, los roles, las llamadas HTTP, los contratos, las dependencias ni el lockfile.

## QA
- `pnpm --filter @losapuntes/mobile test` incluye `public-profile-share.test.ts`.
- Validar acción explícita y payload minimalista, UUID malicioso, estado de error, accesibilidad, retorno a perfil y no filtración de tokens.
- Node24/pnpm9 frozen, Mobile types/lint/format, export Android+iOS, Quality Gate/10 critical coverages, runtime smoke y producción audit exact-head.

## Integración
Fuente funcional: #622; no importar sus cambios antiguos del árbol Mobile. HEAD debe ser analizado tras movimientos de main. HIGH #133 (node-forge) y #705 (Zod) siguen bloqueando certificación global. Sin waiver, deploy, ni activación de Study Progress. Cerrar #622 sólo cuando este reemplazo esté verificado e integrado.
