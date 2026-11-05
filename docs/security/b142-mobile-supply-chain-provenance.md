# B142 — Procedencia comprobable de dependencias Expo/Metro en producción

**Fecha:** 2026-10-20. **Base inicial:** main@6bd965c71f6426da3d49fc7c0555e0e5afda06a9.  
**Objetivo:** validar automáticamente qué clientes alcanzan paquetes de las familias node-forge y braces desde las dependencias de producción del lockfile pnpm v9, conservando siempre el audit y el release HOLD.

## Hallazgos verificados

- El escaneo exact-head previo (B141) mantuvo 2 altos, 3 moderados: node-forge@1.4.0 / GHSA-86w9-cpqp-85rv (#133) y braces@3.0.3 / GHSA-vfj7-8cjw-p6xm (#141).
- Las versiones actuales afectadas no tienen un release upstream corregido confirmado. No se hace upgrade especulativo, no se crea un fork, no se ajustan overrides, no se editan excepciones.
- En el lockfile integrado al iniciar B142, ambos paquetes son alcanzables transitivamente desde apps/mobile; **no** aparecen en los grafos de producción de apps/api ni apps/web. No confundimos esta separación con un estado no vulnerable.
- Un camino de ejemplo, condensado: Mobile → expo@57.0.25 → @expo/cli@57.0.27 → node-forge@1.4.0.
- Un segundo camino real: Mobile → expo@57.0.25 → @expo/cli@57.0.27 → @expo/metro-file-map@57.0.3 → micromatch@4.0.8 → braces@3.0.3. Otros caminos o variantes de Metro pueden coexistir.

## Implementación

1. El inspector \`scripts/security/check-mobile-supply-chain-provenance.mjs\` lee el **lockfile real**, no una transcripción histórica de issues.
2. Recorre las dependencias y dependencias opcionales productivas de API, Web y Mobile, resuelve snapshots incluyendo sufijos de peers, e incluye módulos compartidos \`link:\` mediante resolución confinada al monorepo.
3. El guard observa **familias exactas de paquetes**, no una allowlist de versiones. Si node-forge o braces aparecen por cualquier camino desde API/Web, sale con error y evidencia del recorrido.
4. Un lockfile de formato desconocido, un snapshot faltante, una referencia workspace sin resolver o un recorrido excesivo **fallan cerrados**. Los paquetes dev-only no son contados como runtime.
5. La salida muestra versión y un camino por paquete/importer; nunca dice que el paquete esté parcheado, que la auditoría pasó o que el release se aprobó.
6. Un workflow separado B142 valida código sintáctico, tests adversarios, procedencia contra \`pnpm-lock.yaml\` exacto y política de cero excepciones en Node24.

## Evidencia y límites

El guard de procedencia es una **defensa adicional** para detectar expansión inesperada de alcance hacia el backend o la Web. Su éxito no sustituye \`pnpm audit --prod --audit-level high\`: el workflow general debe continuar rechazando las vulnerabilidades reales hasta que se resuelvan upstream. La API puede estar aislada y **Mobile todavía puede ser vulnerable**.

Se requiere nueva evidencia de paquetes corregidos o eliminación de la dependencia, actualización de lockfile, aceptación mobile (build/doctor/nativo), rerun completo exact-head y revisión de #133/#141 antes de considerar reabrir release #353. No se activan flags ni se mergea/despliega con checks globales fallando.
