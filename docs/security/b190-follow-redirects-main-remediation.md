# B190 — Remediación verificable de follow-redirects sobre main actual

**Fecha:** 2026-10-22. **Estado:** PR Draft / release HOLD. **Base congelada de implementación:** `main@c8077cef7264d162ff84f424fb47252005f206cc`.
**Issues:** follow-redirects #492, otras HIGH sin parche #133 (node-forge) y #141 (braces), release Study Progress #353.

## Motivo y no duplicación

Los PR #495 (B164) y #516 (B181) ya implementaban un parche legítimo `follow-redirects@1.16.1`, pero estaban basados en un main anterior al trabajo reciente de Mobile. Copiar **todo** su lockfile de un checkout viejo habría descartado resoluciones nuevas de Mobile y habría ampliado la superficie de conflictos.

Este carrier aplica solamente **tres reemplazos de resolución** sobre el lockfile ya actualizado de main:

1. `packages.follow-redirects@1.16.0` -> `1.16.1`, con el valor SHA-512 exacto de la publicación oficial npm `sha512-FNvFGzoMLWmE6Yj9spb/zjd7yiNCHiAW9/Tg9CXrQ8wuu32HtlJOwWO11OJafl5FfY3DxTdQ0vj42zU1kvv5jg==`.
2. Único consumidor `snapshots.axios@1.20.0.dependencies.follow-redirects` -> `1.16.1`.
3. Clave de snapshot `follow-redirects@1.16.0: {}` -> `1.16.1: {}`.

Se exige que las tres cadenas originales aparezcan exactamente una vez antes de reescribir y que no queden entradas anteriores. No se alteró `package.json`, `pnpm-workspace.yaml`, `pnpm.overrides`, framework Expo, API, Mobile, cuentas, flags, rutas, Web ni configuraciones de auditoría.

## Pruebas y procedencia independiente

Se copiaron sin modificaciones desde `#516@adcbd25c40f586803e4be59c4cbfae7e400200fd` las fuentes auditadas:
- `scripts/security/check-follow-redirects-lock.mjs`, blob `c173ae857d8e377a2dbc38c1dabc95b928b98fa1`, verificador de integridad, versión, consumidor y lock v9.
- `scripts/security/test-follow-redirects-regression.mjs`, blob `a94e243696c6fe31eff8bfbe557347141dd31195`, regresiones HTTP loopback contra fuga de cabeceras al redirigir a otro origen.

El nuevo workflow `.github/workflows/b190-follow-redirects-main-remediation.yml` se dispara en el HEAD exacto, ejecuta Node24/pnpm9 frozen, consulta `https://registry.npmjs.org` para comprobar **versión + dist.integrity de npm**, chequea grafo pinneado y corre ataques loopback reales, validación de excepciones existente y build Web.

En job independiente se corre `pnpm audit --prod --audit-level high`, **sin** allow-failure/continue-on-error, umbrales inferiores ni filtros de vulnerabilidades. El gate permanece rojo si siguen findings sin parche y debe ser así.

## Realidad del audit

El audit del carrier B189 anterior a B190 reportó cuatro HIGH: `node-forge <=1.4.0`, `braces <=3.0.3`, y **dos** advisories HIGH `follow-redirects >=1.16.0 <1.16.1`. La versión oficial `1.16.1` corrige los problemas de redirecciones, por lo que B190 apunta solo a esos dos. Se espera que `node-forge` y `braces` continúen impidiendo aprobación del release. **No se afirma reducción observada hasta comprobar el nuevo audit exact-head.**

Referencias públicas verificables:
- `https://github.com/advisories/GHSA-q3jh-wrc6-jgq8` — `follow-redirects`, parche `1.16.1`.
- `https://github.com/advisories/GHSA-86w9-cpqp-85rv` — `node-forge`, sin versión corregida a 2026-10-22.
- `https://github.com/advisories/GHSA-vfj7-8cjw-p6xm` — `braces`, sin versión corregida a 2026-10-22.

## Condiciones de integración

- Reconciliar el SHA y las resoluciones nuevas de `main` antes de todo merge. Conflictos con otros cambios de `pnpm-lock.yaml` deben resolverse de forma exacta; jamás aceptar el lock de una rama vieja por encima del main actual.
- No duplicar merge de #495/#516 sobre este carrier sin revisar diffs.
- Aprobar sólo cuando el check específico demuestre instalación frozen, redirecciones seguras, Web build y fuente inmutable.
- El release no se puede liberar mientras el audit HIGH tenga advertencias y el issue #353 permanezca en HOLD.
- Sin producción activada, sin bypass de auditoría, sin versiones inexistentes de `node-forge`/`braces`, sin cambios de permisos.
