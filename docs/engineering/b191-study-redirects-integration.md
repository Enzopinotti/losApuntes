# B191 — Consolidar Study Progress privado + remediación de redirecciones

**Estado:** candidato de integración por PR Draft, no merge ni despliegue. **Fecha:** 2026-10-22.
**Base exacta:** `main@227172f1153ae508cdadd6e318a9837514ed32af`.
**PR preexistentes e independientes:** [B189 #530](https://github.com/Enzopinotti/losApuntes/pull/530), head `6f2a0f4b1a96605f51d255da0083994ceac7de0b`; [B190 #533](https://github.com/Enzopinotti/losApuntes/pull/533), head `eda8cdf1809da004a9b87d70c7bc69995a821104`.

## Objetivo y comparación antes del port

El main del proyecto avanzó 38 commits desde la base de #530 (Mobile y Search Web, más lockfile Mobile). Se comparó el main efectivo con la base de #530 y #533. **No había cambios en los nueve archivos a portar**; los SHA originales del main fueron comprobados por separado antes de cada actualización. Crear la rama sobre el último main evita reemplazar avances ajenos.

No se fusionó ninguna rama antigua completa ni se aplicó una resolución `ours`/`theirs`. Se copiaron byte a byte los siguientes archivos **exactos**:

| Archivo | PR / blob original |
|---|---|
| `apps/api/src/study-progress/mongo/study-progress-export.reader.ts` | B189 / `3f8bcd672e44ca8fececc3d561230235ed3a77a9` |
| `apps/api/src/study-progress/mongo/study-progress-export.reader.spec.ts` | B189 / `895ecd87668a281cf681215f447f09e656596dd5` |
| `apps/api/src/study-progress/study-progress.service.ts` | B189 / `55203ccc6ede9fb91607001c2c710d60348b9237` |
| `apps/api/src/study-progress/study-progress.service.spec.ts` | B189 / `015f926f74ebab560e00179493d5ef36b42b6745` |
| `scripts/test-study-progress-b61-integration.mjs` | B189 / `c6e7d2fddc197cb5bad54e2ef52082538a9782ea` |
| `scripts/test-account-export-b62-integration.mjs` | B189 / `35ade893d7cec3d61e3ab7e7ec5e10b51dc5971d` |
| `pnpm-lock.yaml` | B190 / `871ed919dd7e11b1c6d0c979b1627be4426e5ab6` |
| `scripts/security/check-follow-redirects-lock.mjs` | B190 / `c173ae857d8e377a2dbc38c1dabc95b928b98fa1` |
| `scripts/security/test-follow-redirects-regression.mjs` | B190 / `a94e243696c6fe31eff8bfbe557347141dd31195` |

El lockfile heredado de #533 preserva el estado más reciente de Mobile en la base `227172f` y cambia únicamente los tres puntos `follow-redirects@1.16.0` → `1.16.1` de paquetes, snapshot y dependencia Axios, con integridad oficial SHA-512. Si main cambia el lockfile después de esta base, **reconciliar a nivel de archivo antes de integrar**, nunca aceptar el snapshot anterior silenciosamente.

## Lo que suma B191 en la app

1. **Study Progress GET**: rechaza documentos antiguos corruptos, materias incorrectas, revisiones imposibles y fechas anómalas con error seguro, sin exponer registros Mongo ni claves privadas.
2. **Account Export v3**: preserva las 32 secciones y cursor ligado al propietario; rechaza páginas con duplicados, orden incorrecto, límites excedidos, solapamientos y cronología invertida.
3. **Recuperación Web**: contrato B61 exige volver a consultar el servidor y comparar revisiones antes de reemplazar una sesión local; contrato B62 verifica la proyección Mongo explícita.
4. **Web Axios / redirecciones**: `follow-redirects@1.16.1` evita dos HIGH corregibles; prueba real HTTP confirma que no se filtran credenciales en una redirección entre orígenes. `node-forge` y `braces` aún requieren seguimiento upstream.

## Verificaciones integradas, sin simulaciones

`.github/workflows/b191-study-redirects-integrated-acceptance.yml` toma el **SHA exacto** del PR en tres jobs independientes:

- **Quality + security:** frozen pnpm9/Node24, versión y `dist.integrity` npm oficial, chequeo del lock Axios, cinco regresiones HTTP loopback, guard de excepciones existente, Web TypeScript/build, ESLint/Prettier y TS API, siete suites Jest API, contratos estáticos B61/B62, SHA y árbol limpio.
- **Real Mongo rs0:** 56 pruebas de integración completas con réplica MongoDB 7 efímera, sólo loopback, sin skips, dueños aislados, revisiones, exportación privada y cierre de cuentas.
- **Production HIGH audit:** `pnpm audit --prod --audit-level high` **sin allow-failure ni excepciones**. Una salida no cero debe seguir roja aunque los jobs funcionales pasen.

El CI global del repositorio sigue siendo necesario; no se modifica `.github/workflows/ci.yml` ni se disfraza el fallo de `Container runtime smoke` en los runners con kernels incompatibles para MongoDB 8. El job local de Mongo7 sólo verifica el alcance Study; no reemplaza el smoke global Mongo8.

## Gating / decisiones

- **`STUDY_PROGRESS_ENABLED=false`** sigue siendo obligatorio en producción. No se toca auth, cuentas, APIs, S3, permisos, esquema Mongo, migraciones, retención, backups ni manifiestos export v1/v2/v3.
- **Issues #133 y #141:** parches upstream no confirmados; sin nuevas excepciones, cambios de umbrales ni paquetes falsos. Un check verde de integración no es aprobación de producción si HIGH audit falla.
- **Issue #353:** aceptación multidispositivo/multiusuario, recuperación off-host, retención y cierre efectivo siguen pendientes.
- No fusionar #530 y #533 *además* de este carrier sin revisión de solapamientos. No merge / no deploy sin aprobación humana, seguridad y QA.
- **No declarar un PASS hasta disponer de la evidencia CI exact-head en GitHub.**
