# B261 — Resumen académico público en Mobile sobre main vigente

## Experiencia y privacidad

El servidor puede exponer una proyección académica pública de un perfil cuando su configuración de visibilidad lo permite. Hasta ahora, Mobile omitía esa sección. Se recupera el alcance del carrier histórico #620 **sin fusionar su rama vieja**.

- Sólo si `PublicProfileResponse.profile.academic` existe, se muestra **Trayectoria académica**.
- Se presentan únicamente dos conteos agregados (afiliaciones y materias) con singular/plural correcto.
- No se renderiza nombre de institución, materia, `currentContext`, IDs de afiliaciones, rol ni registros de matrícula.
- La ausencia de sección pública no se interpreta como ausencia real de estudios.
- La autoridad de privacidad permanece exclusivamente en el servidor: la app **no busca** ni reconstruye información privada con otra API.
- No altera sesión, conexión, follow, API, storage, contratos, lockfile ni flags.

## Carrier y cambios

Fuente original: PR #620 (B211). Se reusaron sus helper y tests de conteo, con integración quirúrgica sobre el actual `search-result-screens.tsx` de Mobile para preservar las nuevas experiencias de perfil existentes.

Tests incluidos: singular/plural/cero, no fuga de filas, ausencia de sección cuando la proyección es omitida, asociación al `academic` servidor. El test Mobile existente corre en `pnpm --filter @losapuntes/mobile test`.

## Aceptación y release

Node24/pnpm9 frozen, ESLint, format, TypeScript, test suite Mobile y exports iOS/Android (JS, no binarios), critical coverage y runtime según gate aplicable; auditoría producción exact-head **sin excepciones**. Si siguen HIGH #133 node-forge y #705 zod, conservar DRAFT/HOLD sin merge ni deploy. No habilita Study Progress ni sustituye smokes reales de dispositivos.

Requisitos: PROF-FR-005, PROF-FR-009, MOB-FR-005, MOB-FR-008, NFR-PRIV-001, NFR-A11Y-001 y CHG-005/007.
