# B273 — Reconciliación de avatar público Mobile sobre main actualizado

## Causa

El intento de integrar la PR histórica carrier **#738** directamente produjo **GitHub 405 merge conflicts** tras los merges #736 (compartir perfil) y #739 (intereses e idiomas). No se forzó el merge ni se descartaron cambios: B273 nace del commit integrado `main@ebeea432ecf66e82ce69a745c50c96b4a690ed75`.

## Alcance funcional y de privacidad

- Copia byte-exacta del helper de URL HTTPS + inicial y componente de avatar público de #738 (fuente original #623).
- La pantalla actual presenta imagen **solo si el backend expone** `data.profile.about?.avatarUrl`; mantiene el título accesible y usa un fallback de inicial ante URL ausente/inválida o error de descarga.
- El bloque de cabecera se introduce en la pantalla de `main` sin tocar `SharePublicProfileAction`, `SocialProfileFollowAction`, la trayectoria académica o los intereses/idiomas de #739.
- El componente marca el avatar decorativo como fuera del árbol accesible y nunca consulta un perfil privado.
- Sin cambios a API, Auth, permisos, Mongo, dependencias, lockfile, workflows, feature flags o deploy.

## Commits y pruebas

1. Helper HTTPS público existente (SHA de blob idéntico a #738).
2. Componente avatar público existente (SHA idéntico a #738).
3. Wiring de pantalla reconciliada de main.
4. Tests de URL, credenciales, Unicode e inicial fallback (idénticos a #738).
5. Test de no inferir avatar fuera de proyección (idéntico a #738).
6. Este documento.

Pruebas obligatorias **exact HEAD**: Mobile unit test, contrato de pantalla, `pnpm check`, Quality Gate, 10 critical coverages, exportaciones Expo iOS/Android, Container runtime smoke y `pnpm audit --prod --audit-level high`. La corrección de runner Mongo está en #740/main; HIGH de node-forge #133 y Zod #705 siguen activas y no se silencian. La integración de código no equivale a una aprobación para despliegue. Cerrar #738 solo después de validar la sustitución y dejar el enlace a este carrier.
