# B190 — Fijar follow-redirects parcheado sobre main actual

**Fecha:** 2026-10-22. **Estado:** candidato de integración; release HOLD. **Base exacta:** `main@fdb65713a58213954065065b6dddbc9f4df59ec3`.
**Referencias:** advisories de `follow-redirects` GHSA-q3jh-wrc6-jgq8, `node-forge` GHSA-86w9-cpqp-85rv, `braces` GHSA-vfj7-8cjw-p6xm; seguimiento de release Study Progress #353.

## Alcance

El carrier #533 se creó sobre una base anterior y contenía un workflow dedicado. Esta rama se reconstruyó encima del main actual, conservando sus cuatro commits atómicos de código y documentación, excluyendo el commit de workflow y agregando dos correcciones atómicas para sincronizar la documentación y las etiquetas de las pruebas con este carrier. No se añade ni modifica ningún archivo de `.github/workflows/`.

El cambio actualiza solamente la resolución de `axios@1.20.0 -> follow-redirects` en `pnpm-lock.yaml` de `1.16.0` a la publicación oficial `1.16.1`, con su integridad npm SHA-512 `sha512-FNvFGzoMLWmE6Yj9spb/zjd7yiNCHiAW9/Tg9CXrQ8wuu32HtlJOwWO11OJafl5FfY3DxTdQ0vj42zU1kvv5jg==`. El lock conserva pnpm v9, un único snapshot y un único borde de Axios; no quedan resoluciones `1.16.0`.

No cambia dependencias directas, overrides, configuración de auditoría, Web, Mobile, API ni políticas de release.

## Validación local

Ejecutado en la base `fdb65713a58213954065065b6dddbc9f4df59ec3` más esta rama:

- `node scripts/security/check-follow-redirects-lock.mjs` — PASS; integridad, versión y borde de Axios verificados.
- `node --test scripts/security/test-follow-redirects-regression.mjs` — PASS, 5/5; redirecciones HTTP loopback, eliminación de credenciales entre orígenes, cabeceras sensibles especiales, forma-array y rechazo de lock alterado.
- `corepack pnpm --filter @losapuntes/web build` — PASS; TypeScript, Vite y verificación del manifiesto de release.
- `git diff --check origin/main...HEAD` — PASS.
- `corepack pnpm audit --prod --audit-level high` — FAIL como se esperaba: 2 HIGH (`node-forge`, `braces`) y 3 MODERATE; no reporta `follow-redirects`.
- No se ejecutó CI desde este carril. El workflow separado del carrier original quedó excluido.

La prueba de runtime resuelve también el `follow-redirects` instalado bajo `apps/web` y exige que sea `1.16.1`; las solicitudes de prueba usan únicamente direcciones loopback y secretos sintéticos.

## Límite de seguridad y release

El audit local de este candidato confirma que los dos findings HIGH de `follow-redirects` ya no aparecen; permanecen dos HIGH (`node-forge`, `braces`) más tres MODERATE. Esta rama no afirma que el audit de producción esté limpio ni que el release esté autorizado. Los findings restantes y el HOLD de #353 siguen requiriendo su propio tratamiento y aceptación.

La integración se decide con el estado de GitHub y el `main` vigente al revisar la PR. No se eluden controles requeridos ni se cambian workflows o protecciones.
