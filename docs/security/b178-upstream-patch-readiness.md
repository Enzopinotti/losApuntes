# B178 — Avisos upstream y disponibilidad verificable de parches

**Fecha:** 21/10/2026 · **Base:** `main@6bd965c71f6426da3d49fc7c0555e0e5afda06a9`. **Release:** `#353 HOLD`.

## Contexto de seguridad

El ensayo compuesto B173 incorporó seis PRs en un worktree temporal y pasó el `pnpm check`, los flujos reales Chromium y el smoke integral con MongoDB 8. La auditoría productiva del conjunto siguió correctamente en **2 HIGH y 3 MODERATE**. Las dos HIGH corresponden a `node-forge@1.4.0` (GHSA-86w9-cpqp-85rv / #133) y `braces@3.0.3` (GHSA-vfj7-8cjw-p6xm / #141), ambas en el grafo Expo/Metro. No se encontró una versión parcheada upstream que sea verificable por la base de avisos y el registro npm.

B178 no cambia el lockfile, la aplicación, sus dependencias, paquetes npm, las excepciones de auditoría, CI de release ni los permisos. **No intenta parchear una vulnerabilidad sin un parche real**.

## Flujo de vigilancia

El checker `scripts/security/check-upstream-patch-readiness.mjs` consume exclusivamente:

- `https://api.github.com/advisories/GHSA-86w9-cpqp-85rv`
- `https://api.github.com/advisories/GHSA-vfj7-8cjw-p6xm`
- `https://registry.npmjs.org/node-forge/latest`
- `https://registry.npmjs.org/braces/latest`
- Solo si el advisory declara un `first_patched_version.identifier` estable, consulta `https://registry.npmjs.org/<paquete>/<versión>` y valida el SHA-512 y la URL de su tarball **oficial**.

La respuesta tiene timeout, límite de bytes, JSON estricto y no sigue redirects de otro host. No usa tokens personales, no requiere escribir archivos ni tiene endpoints de actualización. Si GitHub cambió la identidad, la severidad o el alcance del advisory, si un paquete desapareció, si hay versiones pre-release o si el registro y el advisory no coinciden, el resultado es **evidencia inválida** o una revisión manual. No convierte una falla de red en una afirmación de seguridad.

`upstream-patch-readiness.mjs` compara los metadatos con las versiones extraídas de las secciones **package y snapshot del lockfile pnpm v9**, no de una cadena literal recordada. Rechaza omisiones, duplicaciones y valores divergentes.

## Estados y comportamiento de CI

| Estado | Condición | Salida del observador | Efecto en release |
| --- | --- | --- | --- |
| `HOLD_UPSTREAM` | Ambos avisos sin `first_patched_version` oficial y sin nuevos releases sospechosos | Código 0 y evidencia JSON | **HOLD**. No significa PASS del audit |
| `PATCH_ACTION_REQUIRED` | GitHub declara parche estable y npm publicó un tarball con integridad SHA-512 verificable | Código 1: requiere PR de actualización | **HOLD**, sin auto-fix |
| `MANUAL_SECURITY_REVIEW_REQUIRED` | Advisory retirado o publicación más nueva sin versión corregida identificable | Código 1: revisión humana | **HOLD** |
| `INVALID_EVIDENCE` | Datos contradictorios, red fallida, estructura inesperada, lockfile inconsistente | Código 2: fail-closed | **HOLD** |

En todos los casos `releaseAuthorized:false`, `productionAuditCertified:false`, `allowedToOverrideAudit:false`. Una actualización para la cual exista un parche debe abrir un PR independiente, incluir prueba reproducible y volver a ejecutar `pnpm audit --prod --audit-level high`, Android/iOS, empaquetado y smoke sobre SHA exacto.

El workflow `.github/workflows/b178-upstream-patch-readiness.yml` ejecuta pruebas adversariales y consulta ambas fuentes en **GitHub Actions (Node 24) sobre el HEAD exacto**, con permisos `contents:read`, sin credenciales Git persistidas. Tiene disparadores de PR, rama de trabajo, manual y revisión diaria **solo cuando llegue a `main`**. No publica ni fusiona nada: la ejecución diaria puede avisar con estado rojo de un parche disponible, pero **no es un gate de release verde**.

## Pruebas

`scripts/security/upstream-patch-readiness.test.mjs` cubre la clasificación sin parche, parche publicado auténtico, release sin parche declarado, advisory retirado, identidad/scope/severidad falsos, versiones inválidas o prerelease, respuesta npm suplantada, hash alterado, URL de tarball falsa, fuente incompleta, paquetes duplicados, secciones de lockfile incompatibles y ausencia de efectos de escritura.

No se debilita el gate `pnpm audit:prod` del monorepo. La ausencia temporal de soluciones oficiales **no constituye una aprobación de riesgo ni habilita deploy**.

## Referencias verificables

- https://github.com/advisories/GHSA-86w9-cpqp-85rv
- https://github.com/advisories/GHSA-vfj7-8cjw-p6xm
- https://github.com/Enzopinotti/losApuntes/issues/133
- https://github.com/Enzopinotti/losApuntes/issues/141
- https://github.com/Enzopinotti/losApuntes/issues/353

**Limitación deliberada:** el checker usa la versión explícita y la integridad tal como fueron declaradas por fuentes oficiales. No infiere que una versión cualquiera sea segura ni analiza automáticamente la compatibilidad semántica de Expo/Metro. Esa verificación es parte del futuro PR de remediación, no del monitor.
