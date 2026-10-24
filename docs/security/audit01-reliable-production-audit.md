# AUDIT01 — Auditoría HIGH reproducible ante errores de npm

**Fecha:** 22 de octubre de 2026. **Base:** `main@e9050c00262b3ee2242058cc386c3d41efb61654`. **Tipo:** seguridad / CI, sin modificar dependencias ni excepciones.

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

Los [avisos de `node-forge`](https://github.com/advisories/GHSA-86w9-cpqp-85rv) y [`braces`](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) siguen abiertos y no declaran versiones parcheadas al 22/10/2026.

**Resultado de seguridad esperado:** con 2 HIGH reales, el workflow de seguridad continúa rojo. Sin acceso a npm, también continúa rojo, pero con `PROVIDER_UNAVAILABLE` en lugar de afirmar falsamente que no hay vulnerabilidades. El release #353 permanece **HOLD**.
