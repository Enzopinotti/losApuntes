# B235 — Identidad visual de organizaciones

El directorio y la página pública de cada organización muestran el avatar que ya entrega el contrato de Organizaciones, tanto en Web como en Mobile. Se reutiliza el renderizado público existente: carga solo URLs HTTPS permitidas, deja la inicial si falta una imagen o falla su descarga y mantiene el nombre visible y accesible.

No hay cambios de API, privacidad, permisos, campos de perfil ni persistencia. El avatar es decorativo porque el nombre de la organización permanece como texto junto a él.

## Validación

- Contrato Web/Mobile de Organizaciones y política compartida de avatar seguro.
- Build y ESLint Web, pruebas Mobile y TypeScript Mobile.
- Formato del monorepo, higiene y `git diff --check`.

La validación local no sustituye los checks automáticos de GitHub ni constituye aceptación de release.
