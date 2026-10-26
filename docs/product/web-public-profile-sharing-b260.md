# B260 — Compartir perfiles públicos desde Web (reconciliación de #629)

## Problema y alcance

Los perfiles públicos tienen una URL canónica estable, pero la interfaz Web no permite compartirla en un paso. Esta rama recupera las capacidades propias del antiguo carrier #629 **sin fusionar su árbol histórico** y preserva en `PublicProfile.tsx` las incorporaciones posteriores de avatar, presentación, secciones y activity pagination.

## Comportamiento del usuario

- Cuando existe una proyección pública con nombre, la cabecera presenta **Compartir perfil** junto a acciones sociales existentes.
- Construye `/p/{profileId}` usando exclusivamente el UUID v4 público y el `window.location.origin` actual; no incrusta cookies, tokens ni parámetros privados.
- Si el navegador implementa Web Share API, pide el diálogo nativo; cancelarlo no produce una falsa confirmación.
- Si no existe Web Share o falla, intenta Clipboard; si tampoco puede copiar, muestra un campo `readOnly` seleccionable con estado `role="alert"`.
- El botón está deshabilitado durante la operación. Visitantes anónimos pueden compartir la página pública sin ganar autoridad de cuenta o acceso a campos privados.
- No se cambian API/Auth/roles/persistencia/visibilidad, backend, lockfile, flags ni dependencias.

## Implementación y verificación

1. Helper de validación de UUID y origen, y componente Web reutilizable.
2. Integración quirúrgica de la cabecera actual, sin reemplazar otros componentes.
3. CSS para layout y fallback accesible.
4. Contratos de URL maliciosa, UI compartida, preservación de acciones sociales y wiring en `pnpm test:web-public-profile-social`.
5. Verificar sobre **HEAD exacto** con Node24/pnpm9 frozen: quality/format/lint/typecheck/test/build, critical coverage, navegador/runtime cuando corresponda y producción `pnpm audit --prod --audit-level high`.

**Requisitos**: PROF-FR-003, PROF-FR-009, NFR-A11Y-001, NFR-SEC-001 y CHG-005/007. No se introduce nueva autoridad funcional.

## Decisión de integración

Carrier fuente: #629. Conservar #629 abierto hasta aprobación del reemplazo. El audit de producción conserva HIGH #133 (`node-forge`, sin parche oficial) y #705 (`zod`); no añadir excepciones ni bajar umbral. Mantener DRAFT/HOLD para `main` mientras el contrato canónico falle. Una validación focalizada del componente no certifica release, Study Progress ni deployment.
