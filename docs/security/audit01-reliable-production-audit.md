# AUDIT01 — Auditoría HIGH reproducible ante errores de npm

**Reconciliación:** 25 de octubre de 2026. **Base:** `main@fb52a1d681d26767d1aa2402438bf9e1954157a7`. **Origen técnico:** Draft #703 AUDIT01 del 22/10, portado quirúrgicamente al main vigente sin arrastrar cambios de producto. **Tipo:** seguridad / CI, sin modificar dependencias ni excepciones.

## Hallazgo que resolvemos

En el ensayo de integración B186, un `pnpm audit:prod` falló por `ERR_SOCKET_TIMEOUT` antes de obtener los avisos, mientras un segundo intento independiente sí devolvió **dos HIGH y tres moderadas**. Ambas ejecuciones debían y deben quedar rojas; pero una falla de proveedor no debe confundirse con un número conocido de vulnerabilidades, y los intentos no deben provocar aprobaciones engañosas.

La CI existente consultaba npm **dos veces** en el mismo job: una llamada `pnpm audit --prod --json` para diagnóstico con `|| true` y una llamada obligatoria `pnpm audit --prod --audit-level high`. AUDIT01 elimina esa duplicación y usa **el mismo comando obligatorio original**, sin cambiar el umbral ni la semántica de `package.json.scripts.audit:prod`.

## Qué hace

1. Ejecuta `pnpm audit --prod --audit-level high` mediante `spawn`, sin shell, sin cambiar el comando original ni el registry, máximo **2 intentos**.
2. Cada intento está limitado a 95 segundos y 1 MiB de salida. Los fallos de spawn, timeout, kill, contenido excesivo o estado no reconocido cierran el gate con error. No interpreta salida vacía como PASSED.
3. Un informe explícito de vulnerabilidades o de GHSA con exit code distinto de cero termina inmediatamente `VULNERABILITIES_FOUND` (código 1). **No se reintenta una vulnerabilidad.**
4. Solo un error reconocible y sin diagnóstico de advisories (`ERR_SOCKET_TIMEOUT`, `ETIMEDOUT`, `ECONNRESET`, `EAI_AGAIN`, `ENOTFOUND` o error específico de disponibilidad) admite **un único reintento** después de 3 segundos. Si el registro sigue inalcanzable, salida `PROVIDER_UNAVAILABLE` (código 2), nunca PASS.
5. Exit 0 requiere además la prueba textual inequívoca `No known vulnerabilities found` (o cero vulnerabilidades). Un exit 0 sin evidencia, con alertas o con fallo de red en la salida equivale a `INVALID_EVIDENCE`, código 2.
6. Antes/después de cada intento calcula SHA-256 de `package.json`, `pnpm-lock.yaml` y `security/audit-exceptions.json`. Cualquier mutación del grafo o de política de excepciones termina `SOURCE_DRIFT`, código 2.
7. El controlador comprueba que `package.json.scripts.audit:prod` **siga siendo exactamente** el comando audit original. Mantiene la ejecución de `pnpm security:audit-exceptions` como paso obligatorio y añade un gate de worktree limpio tras la auditoría incluso ante fallos.
8. Los resultados estructurados, aptos para clasificación de logs, siempre llevan `authorized: false` o `releaseAuthorized:false`. Un éxito del scanner requiere todavía calidad, autorización, pruebas de runtime, firma y aceptación de producto. **Nunca certifica la release**.

## Pruebas de regresión

`scripts/security/reliable-production-audit.test.mjs` cubre: comando inmutable, salida limpia explícita, avisos HIGH no reintentables, doble caída de proveedor, caída seguida por vulnerabilidad, caída seguida por respuesta limpia, falla desconocida, exit 0 falso, error de red mezclado con exit 0, kill/timeout/exceso de bytes, mutación del lockfile, abuso del contador de reintentos, condiciones del workflow y registro `authorized:false`.

`.github/workflows/audit01-reliable-production-audit.yml` valida de forma aislada el algoritmo con Node 24 sobre el **SHA exacto**, sin depender del registro npm. El workflow global `verify` es quien hace la comprobación **viva, obligatoria y sin waivers**.

## Alcance y limitaciones

El nuevo runner **no repara** las vulnerabilidades identificadas. No cambia el lockfile, no agrega forks o dependencias sin parches, no admite excepciones ni `auditConfig`, no modifica releases, no publica artefactos. Tampoco afirma que las herramientas CLI de terceros sean infalibles: solo protege la clasificación cuando devuelven un código y evidencia textual coherentes. El archivo `triage-production-audit.mjs` se conserva para investigación detallada manual por JSON cuando haga falta.

El advisory [`node-forge`](https://github.com/advisories/GHSA-86w9-cpqp-85rv) sigue activo sin versión corregida anunciada. El advisory [`braces`](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) fue **retirado el 23/10/2026**; no se lo debe contar como HIGH vigente por documentación vieja, pero únicamente el audit productivo vivo sobre el HEAD exacto confirma qué findings reporta el registro. El [advisory Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), rastreado en #705, sigue activo; no imponer Zod 4 en Expo sin validar compatibilidad.

**Resultado de seguridad esperado:** con 2 HIGH reales, el workflow de seguridad continúa rojo. Sin acceso a npm, también continúa rojo, pero con `PROVIDER_UNAVAILABLE` en lugar de afirmar falsamente que no hay vulnerabilidades. El release #353 permanece **HOLD**.

## Estado de integración (25/10/2026)

Este carrier está aislado del frontend y de Study Runner (#710), no cambia `pnpm-lock.yaml`, versiones, excepciones ni política de release. La suite histórica de #703 aprobó 13/13 checks focales, pero esa evidencia **no es válida para este HEAD nuevo**: deben correr los checks de este PR y la auditoría actual. Aunque la lógica se integre en el futuro, el resultado del auditor por sí solo nunca autoriza Study Progress ni un despliegue.
