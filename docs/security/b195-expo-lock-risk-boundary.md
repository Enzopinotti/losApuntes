# B195 — Auditoría del límite de dependencias Expo con advisories sin parche

**Fecha de verificación:** 2026-10-23. **Base:** `main@fb52a1d681d26767d1aa2402438bf9e1954157a7`. **Estado:** PR Draft, no merge/deploy por audit HIGH.

## Situación real y alcance

La auditoría de producción exact-head del 23 de octubre de 2026 reporta **17 vulnerabilidades: 5 LOW, 10 MODERATE, 2 HIGH**. Las HIGH actuales son **node-forge** y **zod**. El paquete **braces** permanece instalado en el lockfile y tiene un aviso histórico sin parche confirmado, pero **no aparece como HIGH en esta corrida**; por eso B195 conserva su vigilancia sin confundirla con la salida actual de pnpm:

- [#133](https://github.com/Enzopinotti/losApuntes/issues/133) — `node-forge@1.4.0`, GHSA-86w9-cpqp-85rv, cadena transitoria Expo/CLI y certificados.
- [#141](https://github.com/Enzopinotti/losApuntes/issues/141) — `braces@3.0.3`, GHSA-vfj7-8cjw-p6xm, cadena Metro/metro-file-map/micromatch; **riesgo de lockfile monitoreado, no HIGH reportada por este escaneo**.
- **Nuevo hallazgo HIGH** — `zod@3.25.76`, GHSA-mrhx-c7xc-m3w5, declarado por `@expo/cli@57.0.27`. Hay ramas 4.6.6+ publicadas, pero forzar el salto mayor desde Expo CLI sin validar contratos y build no constituye una actualización segura; la solución upstream tiene limitaciones para esquemas no acotados.

El origen y los paquetes **no** se sustituyen por versiones inexistentes, forks sin revisión, `pnpm.overrides`, una excepción de audit, ni cambios al umbral. El PR [#703](https://github.com/Enzopinotti/losApuntes/pull/703) trabaja separadamente en transporte de la auditoría y no se toca. El control preexistente `check-api-runtime-dependency-boundary.mjs` sigue verificando el store instalado en Docker API. B195 añade una garantía **diferente**: alcanzar nodos del grafo transitivo partiendo de todos los importers productivos declarados en `pnpm-lock.yaml`.

## Implementación

1. Un parser cerrado para los bloques `importers`, `packages` y `snapshots` del formato pnpm lock v9. Lee aristas de `dependencies` y `optionalDependencies`; no incluye `devDependencies` como si fueran producción.
2. Calcula el cierre transitivo desde `apps/api`, `apps/web` y `apps/mobile`, siguiendo referencias de snapshots con variantes de peer dependency y links locales a importers conocidos. Si falta un nodo, cambia la estructura del lock, hay referencias desconocidas o desaparece una de las versiones vulnerables actuales, aborta y exige revisión.
3. Para las dependencias de riesgo conocidas exige que **API y Web no alcancen** `node-forge`, `braces` ni `zod`; Mobile sí sigue alcanzándolas y se marca explícitamente `CONFINED_BUT_VULNERABLE`.
4. Rechaza **nuevos consumidores directos**, incluso no alcanzables desde un importer: `braces` sólo por `micromatch`, `node-forge` desde `@expo/cli` o `@expo/code-signing-certificates`, y `zod` desde `@expo/cli`. Esto evita que una nueva rama extienda la exposición silenciosamente.
5. `node:test` incluye ataques sintéticos de contaminación de API/Web, nuevos padres, resolución desconocida, links no autorizados, lock truncado y migraciones; también evalúa el **lockfile real del HEAD** para impedir un PASS obtenido sólo con datos falsos.
6. El workflow `.github/workflows/b195-expo-risk-graph-boundary.yml` ejecuta Node24 sin instalar paquetes ni mutar el repo, comprueba el SHA y el working tree antes/después y verifica que el paso global `pnpm audit --prod --audit-level high` siga existiendo y sin waivers.

## Lectura del resultado

El éxito de esta prueba sólo significa que la topología transitiva del lock sigue **confinada a Mobile**. No demuestra que el paquete sea seguro dentro del binario móvil, que la entrada no pueda ser controlada por usuarios, ni que el proceso Expo/Metro de firma/compilación sea invulnerable. No sustituye `pnpm audit --prod`, los builds/firmas Mobile, una inspección del artefacto publicado, ni la aprobación de seguridad. El resultado devuelve siempre `productionAuditCertified:false` y `releaseAuthorized:false`.

### Evidencia inicial de grafo real

En la base inspeccionada, recorriendo todos los snapshots productivos y las variantes de peers:
- `apps/api`: 139 snapshots, **ninguna** de las dos bibliotecas vulnerable alcanzable.
- `apps/web`: 48 snapshots, **ninguna** alcanzable.
- `apps/mobile`: 585 snapshots, **las tres bibliotecas** alcanzables. Entre los caminos efectivos están `metro-file-map → micromatch → braces` y `@expo/cli → node-forge / zod`.
- Padres directos observados: `braces` por `micromatch`; `node-forge` por `@expo/cli` y `@expo/code-signing-certificates`; `zod` por `@expo/cli`.

**Los recuentos son diagnósticos**, no un criterio de liberación. Las pruebas CI del nuevo script deben validar que esta observación se reproduce sobre el SHA final, independientemente de que el main avance.

## Política de release y revalidación

Las alertas #133 y #141 siguen abiertas para seguimiento upstream. Además la **nueva HIGH `zod` debe permanecer visible y bloqueante**; el siguiente carril de remediación debe evaluar formalmente un cambio compatible de Expo o asegurar límites de los esquemas expuestos antes de elevar una actualización de zod 3→4. El gate global HIGH sigue obligatorio, rojo y sin `continue-on-error`. No se modifica `package.json`, lockfile, Expo/Metro, auditoría, excepciones ni CI principal. Feature flag `STUDY_PROGRESS_ENABLED=false` y aceptación [#353](https://github.com/Enzopinotti/losApuntes/issues/353) también permanecen intactos.

Antes de merge: comparar nuevamente main/HEAD, confirmar tests de B195, confirmar auditoría global bloqueante, y no fusionar el código de #703 sin conciliación explícita de sus archivos.
