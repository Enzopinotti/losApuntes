# B164 — Remediación real de dos GHSA altos en `follow-redirects`

**Fecha:** 20/10/2026. **Base:** `main@6bd965c71f6426da3d49fc7c0555e0e5afda06a9`.  
**Issue:** [#492](https://github.com/Enzopinotti/losApuntes/issues/492). **Estado:** PR Draft; release #353 HOLD.

## Hallazgo y corrección

Dos avisos GHSA altos afectaban el mismo paquete transitivo: **GHSA-q3jh-wrc6-jgq8** (encabezados HTTP proporcionados como array que omiten el filtrado en redirecciones) y **GHSA-8r9p-f939-6h3c** (nombres de encabezados sensibles con los caracteres `^` y `|` mal escapados). Según GitHub Advisory Database ambos afectan `follow-redirects >=1.16.0, <1.16.1` y ambos quedan corregidos por **1.16.1**. Referencias:

- https://github.com/advisories/GHSA-q3jh-wrc6-jgq8
- https://github.com/advisories/GHSA-8r9p-f939-6h3c
- https://github.com/follow-redirects/follow-redirects/releases/tag/v1.16.1

Análisis directo de `pnpm-lock.yaml` antes del bloque: **único** camino desde producción de `apps/web → axios@1.20.0 → follow-redirects@1.16.0`; no alcanzable por la API o Mobile en sus grafos de producción. Se conservaron los manifests y las dependencias directas sin overrides, forks, exclusiones ni cambio de versión de Axios.

## Actualización auditable del lockfile

Solo se reemplazaron las **tres referencias de lock** al paquete/snapshot/dependencia Axios y la integridad de su tarball, obtenida independientemente del registro oficial npm con `npm view follow-redirects@1.16.1 dist.integrity` en el runner GitHub Actions Node24. Integridad exacta registrada:

`sha512-FNvFGzoMLWmE6Yj9spb/zjd7yiNCHiAW9/Tg9CXrQ8wuu32HtlJOwWO11OJafl5FfY3DxTdQ0vj42zU1kvv5jg==`

Evidencia de origen: [B164 npm registry run #39531056533](https://github.com/Enzopinotti/losApuntes/actions/runs/39531056533) SUCCESS. La validación no debe basarse solo en comparar un string conocido: el runner consulta el registry oficial en cada ejecución y rechaza identidad de versión inválida.

## Cobertura funcional y de seguridad

- `scripts/security/check-follow-redirects-lock.mjs`: contrato fail-closed para pnpm v9, versión 1.16.1 en paquetes y snapshots, hash npm SHA-512 y único edge Axios.
- `scripts/security/test-follow-redirects-regression.mjs`: tests Node24 con **dos servidores HTTP en loopback** y diferente origen, sin red externa ni secretos reales:
  - Axios sigue redirección legítima y conserva encabezados no sensibles, sin enviar Authorization o Cookie a otro origen.
  - La protección de `sensitiveHeaders` bloquea encabezados que contienen `^` o `|`.
  - Encabezados en formato array no pueden filtrarse en silencio: deben sanitizarse o rechazarse explícitamente.
  - Tests de alteración del lock contra downgrade de versión, cambio de hash, edge vulnerable y formato no soportado.
- CI focalizada B164: pnpm frozen workspace, comparación de metadatos oficiales, scripts y pruebas, cero excepciones, typecheck y build Web, tree limpio y SHA exacto.
- CI global conserva `pnpm audit --prod --audit-level high` **bloqueante**. No se limita ni se ignora el informe de otras vulnerabilidades.

## Separación de objetivos

Remediar los dos altos **nuevos** del issue #492 no resuelve automáticamente las vulnerabilidades preexistentes #133 (`node-forge`) y #141 (`braces`). El resultado deseado es reducir las vulnerabilidades altas conocidas de cuatro a dos, si no aparecen otras en el registro. El número real solo se declara tras auditar **el HEAD exacto**. La existencia de paquetes no importados al bundle JS tampoco remedia vulnerabilidades de construcción. El release #353 permanece HOLD hasta que la auditoría productiva y los demás gates completos aprueben sin excepciones.

No hubo merge ni despliegue: la aceptación de este bloque solo puede basarse en pruebas y checks reales de GitHub.
